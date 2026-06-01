import { GoogleGenAI } from "@google/genai";
import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import path from "path";
import Parser from "rss-parser";
import axios from "axios";
import * as cheerio from "cheerio";

dotenv.config({ path: path.join(process.cwd(), '.env.example') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const notion = new Client({ auth: process.env.NOTION_API_KEY });

const eventsDbId = "36b2e434-eb2e-81f5-b7e8-e93f523335e0";
const townsDbId = "36c2e434-eb2e-813a-bb09-c19d6c4ff809";
const roadsDbId = "3722e434-eb2e-8007-b768-f4f904d7f8fc";
const sourcesDbId = "36b2e434-eb2e-81b8-9a41-fce9266167eb";

const parser = new Parser({
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:106.0) Gecko/20100101 Firefox/106.0' }
});

// Headers for Axios to mimic a real browser to bypass some basic WAFs/Blocks
const getScraperHeaders = () => ({
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "es-CO,es;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive"
});

async function getSourcesFromNotion(): Promise<string[]> {
  const urls: string[] = [];
  try {
    const response = await notion.databases.query({
      database_id: sourcesDbId,
    });
    
    for (const page of response.results as any[]) {
      const urlProp = page.properties?.URL;
      if (urlProp && urlProp.url) {
        urls.push(urlProp.url);
      }
    }
  } catch (err) {
    console.error(`[Notion SDK] Error fetching sources:`, err);
  }
  return urls;
}

async function cleanOldNotionData() {
  console.log("Limpiando datos antiguos en Notion usando SDK...");
  const today = new Date().toISOString().split('T')[0];

  try {
    // 1. Limpiar eventos antiguos
    const eventsQuery = await notion.databases.query({
      database_id: eventsDbId,
      filter: { property: "Fecha Inicio", date: { before: today } }
    });
    
    for (const page of eventsQuery.results) {
      await notion.pages.update({ page_id: page.id, archived: true });
    }
    console.log(`Eliminados ${eventsQuery.results.length} eventos obsoletos.`);

    // 2. Limpiar vías antiguas (para recargar desde cero frescas)
    const roadsQuery = await notion.databases.query({
      database_id: roadsDbId
    });
    for (const page of roadsQuery.results) {
      await notion.pages.update({ page_id: page.id, archived: true });
    }
    console.log(`Eliminadas ${roadsQuery.results.length} alertas viales para refresco.`);
  } catch (err) {
    console.error("[Notion SDK] Error limpiando datos:", err);
  }
}

// Scrape con Axios/Cheerio como Fallback para links que no son RSS
async function scrapeUrlHTML(url: string): Promise<string> {
    try {
        const response = await axios.get(url, {
             headers: getScraperHeaders(), 
             timeout: 10000 
        });
        const $ = cheerio.load(response.data);
        
        // Remove scripts, styles and nav elements to reduce context size
        $('script, style, nav, footer, header, iframe').remove();
        let mainText = $('body').text().replace(/\s+/g, ' ').trim();
        return mainText.substring(0, 3000); // 3000 caracteres de muestra para la IA
    } catch (e: any) {
        console.warn(`[Axios/Cheerio] Error scraping ${url}: ${e.message}`);
        return "";
    }
}

export async function scrapeEventsAndSeedNotion() {
  if (!eventsDbId || !townsDbId || !roadsDbId || !process.env.NOTION_API_KEY) {
    console.error("Faltan variables de entorno o IDs de Notion. Abortando.");
    return false;
  }
  
  await cleanOldNotionData();

  try {
    console.log("[Motor de Scraping] Obteniendo urls maestras...");
    const dbUrls = await getSourcesFromNotion();
    const allUrls = dbUrls.length > 0 ? dbUrls : [];
    
    let feedItems: string[] = [];
    
    if (dbUrls.length > 0) {
      for (const url of dbUrls) {
        try {
          // Intentar como RSS primero
          const feed = await parser.parseURL(url);
          const titles = feed.items.slice(0, 5).map(i => `- ${i.title} (${i.pubDate || ''})`).join('\n');
          feedItems.push(`[RSS] ${url}:\n${titles}`);
        } catch(e: any) {
          // Si falla, extraer con Axios y Cheerio el contenido HTML
          console.log(`[Scraping] ${url} no es RSS, procediendo con Cheerio...`);
          const textExcerpt = await scrapeUrlHTML(url);
          if (textExcerpt) {
              feedItems.push(`[WEB] ${url}:\nContenido principal: ${textExcerpt}`);
          }
        }
      }
    }
    
    if (feedItems.length === 0) {
      feedItems.push("No se pudo obtener información de fuentes directamente. Por favor genera eventos generales de Colombia.");
    }

    const contextData = `Fuentes analizadas: ${allUrls.join(", ")}\n\nDatos Recolectados:\n${feedItems.join("\n\n")}`;

    const today = new Date();
    const in90Days = new Date(today);
    in90Days.setDate(today.getDate() + 90);
    const dateRangeStr = `${today.toLocaleDateString()} a ${in90Days.toLocaleDateString()}`;
    
    const promptCombined = `Eres un experto data-miner web de Colombia.
A continuación tienes datos extraídos crudos de varias fuentes web e invias (RSS y HTML plano):
${contextData}

Analiza este texto y genera un JSON estricto con un arreglo: "events".

Reglas "events":
- Extrae eventos de los textos proporcionados. Si no hay, infiere eventos populares culturales de Colombia para las fechas ${dateRangeStr}.
- Agrega un número aleatorio a "seed" (ej: &seed=987123) en cada imagen para que sea estable y estática pero única para cada evento.
- Formato evento: { "title": "...", "date": "YYYY-MM-DD", "department": "...", "municipality": "...", "category": "Cultural | Gastronomía | ...", "source": "url original", "image": "pollinations_url (ej: https://image.pollinations.ai/prompt/Fotografia%20realista%20comida%20festival%20colombia?width=800&height=500&nologo=true&seed=42)", "lat": 1.1, "lng": -77.1, "summary": "breve resumen" }

Responde MÁQUINA A MÁQUINA ÚNICAMENTE con el objeto JSON: { "events": [] } sin bloques de formato extra.`;

    console.log("LLM: Generando y estructurando JSON...");
    const resCombined = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: promptCombined });
    const parseJSON = (str: string) => JSON.parse(str.replace(/\`\`\`[a-z]*\n?/g, "").replace(/\`\`\`/g, "").trim());
    
    const data = parseJSON(resCombined.text || "{}");
    const events = data.events || [];
    
    // Scrape Roads from INVIAS API explicitly
    let roads: any[] = [];
    try {
       console.log("Iniciando actualización de vías...");
       const rp = await axios.get('https://www.datos.gov.co/resource/7i66-rps2.json?$limit=30&$order=fecha DESC');
       
       for (const r of rp.data) {
           let lat = 0;
           let lng = 0;
           
           // Geocode using Nominatim OpenStreetMap (adding a small delay to respect rate limit)
           if (r.municipio) {
               try {
                   const searchQ = `${r.municipio}, ${r.departamento || ''}, Colombia`;
                   const geoRes = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQ)}`, {
                       headers: { 'User-Agent': 'NomadAp-Scraper/1.0' }
                   });
                   if (geoRes.data && geoRes.data.length > 0) {
                       lat = parseFloat(geoRes.data[0].lat);
                       lng = parseFloat(geoRes.data[0].lon);
                   }
                   await new Promise(resolve => setTimeout(resolve, 1200)); // Rate limit 1 request/sec
               } catch(ex) {
                   console.log(`Fallo geocoding municipio: ${r.municipio}`);
               }
           }
           
           roads.push({
               title: r.corredor_vial_via_que_conduce || r.municipio || "Vía INVIAS",
               description: r.motivo_de_la_afectaci_n_vial || "Afectación vial",
               status: r.estado_de_reporte === "CERRADO" ? "closed" : "restricted",
               date: r.fecha || new Date().toISOString(),
               lat,
               lng
           });
       }
       
       console.log(`Se procesaron ${roads.length} reportes de vías de INVIAS API.`);
    } catch(err) {
       console.error("Error fetching INVIAS api", err);
    }

    console.log(`[Notion SDK] Insertando ${events.length} eventos y ${roads.length} reportes viales...`);
    let eventsSaved = 0;
    
    for (const event of events) {
      if (!event.title) continue;
      try {
        await notion.pages.create({
          parent: { database_id: eventsDbId },
          properties: {
            "Evento": { title: [{ text: { content: event.title } }] },
            "Fecha Inicio": { date: { start: event.date } },
            "Departamento": { rich_text: [{ text: { content: event.department || "" } }] },
            "Municipio": { rich_text: [{ text: { content: event.municipality || "" } }] },
            "Categoría": { select: { name: event.category || "Cultural" } },
            "Estado": { select: { name: "Activo" } },
            "Fuente": { url: event.source || "https://invias.gov.co" },
            "Imagen": { url: event.image || "https://images.unsplash.com/photo-1547473078-cbffce75e1ec?w=800" },
            "Latitud": { number: event.lat || 0 },
            "Longitud": { number: event.lng || 0 },
            "Resumen": { rich_text: [{ text: { content: event.summary || "" } }] }
          }
        });
        eventsSaved++;
      } catch (err: any) {
        console.warn(`[SDK Error] Evento omitido ${event.title}`);
      }
    }
    
    let roadsSaved = 0;
    for (const r of roads) {
      if (!r.title) continue;
      try {
        await notion.pages.create({
          parent: { database_id: roadsDbId },
          properties: {
            "Título": { title: [{ text: { content: r.title } }] },
            "Descripción": { rich_text: [{ text: { content: r.description } }] },
            "Estado": { select: { name: r.status || "warning" } },
            "Fecha": { date: { start: r.date || new Date().toISOString() } },
            "Latitud": { number: r.lat || 0 },
            "Longitud": { number: r.lng || 0 }
          }
        });
        roadsSaved++;
      } catch(err: any) {
        console.warn(`[SDK Error] Vía omitida ${r.title}`);
      }
    }
    
    console.log(`✅ Scraping masivo finalizado. Eventos: ${eventsSaved}, Vías: ${roadsSaved}.`);
    return true;

  } catch (e) {
    console.error("[Motor de Scraping] Error Critico:", e);
    return false;
  }
}

if (process.argv[2] === "run") {
    scrapeEventsAndSeedNotion().then(v => {
        if (v) process.exit(0);
        else process.exit(1);
    });
}
