import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Client } from "@notionhq/client";
import cors from "cors";
import dotenv from "dotenv";
import cron from "node-cron";
import { scrapeEventsAndSeedNotion } from "./scraper";

import { pruneOldRecords } from "./engine_cleaner";

dotenv.config();
if (!process.env.NOTION_API_KEY) {
  dotenv.config({ path: '.env.example' });
}

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const usersDbId = "36c2e434-eb2e-81d5-b83a-e2791cdb1d0b";
const eventsDbId = "36b2e434-eb2e-81f5-b7e8-e93f523335e0";
const roadsDbId = "3722e434-eb2e-8007-b768-f4f904d7f8fc";
const townsDbId = "36c2e434-eb2e-813a-bb09-c19d6c4ff809";

async function queryNotionDb(dbId: string) {
  const response = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Failed to fetch from Notion");
  return data;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Route to register a user
  app.post("/api/register", async (req, res) => {
    try {
      const { name, email, provider, photoUrl } = req.body;

      if (!usersDbId) {
        throw new Error("NOTION_USERS_DATABASE_ID is not set.");
      }

      const response = await notion.pages.create({
        parent: { database_id: usersDbId },
        properties: {
          "Nombre": {
            title: [ { text: { content: name || "Nuevo Usuario" } } ],
          },
          "Email": {
            email: email || null,
          },
          "Proveedor": {
            select: { name: provider === "Outlook" ? "Outlook" : "Google" },
          },
          "FotoUrl": {
            url: photoUrl || null,
          }
        }
      });

      res.status(200).json({ success: true, message: "User registered in Notion successfully!", data: response });
    } catch (error: any) {
      console.error("Error creating Notion user profile:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // API Route for User Search History
  app.post("/api/search", async (req, res) => {
    try {
      const { keyword } = req.body;
      if (!keyword) return res.status(400).json({success: false, error: "Keyword required"});
      
      const response = await notion.pages.create({
        parent: { database_id: eventsDbId },
        properties: {
          "Evento": { title: [{ text: { content: `Búsqueda: ${keyword}` } }] },
          "Categoría": { select: { name: "Búsqueda" } },
          "Fecha Inicio": { date: { start: new Date().toISOString() } }
        }
      });
      res.status(200).json({ success: true, data: response });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/searches", async (req, res) => {
    try {
      const response = await fetch(`https://api.notion.com/v1/databases/${eventsDbId}/query`, {
        method: "POST",
        headers: {
           "Authorization": `Bearer ${process.env.NOTION_API_KEY}`,
           "Notion-Version": "2022-06-28",
           "Content-Type": "application/json"
        },
        body: JSON.stringify({
          filter: { property: "Categoría", select: { equals: "Búsqueda" } },
          sorts: [{ timestamp: "created_time", direction: "descending" }]
        })
      });
      const data = await response.json();
      const searches = (data.results || []).map((page: any) => ({
         id: page.id,
         keyword: page.properties["Evento"]?.title?.[0]?.plain_text?.replace("Búsqueda: ", "") || "",
         date: page.created_time
      }));
      res.status(200).json({ success: true, data: searches });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // API Route to fetch events from Notion
  app.get("/api/events", async (req, res) => {
    try {
      if (!eventsDbId) {
        throw new Error("NOTION_EVENTS_DATABASE_ID is not set.");
      }
      const response = await queryNotionDb(eventsDbId);

      const events = response.results.map((page: any) => {
        const props = page.properties;
        return {
          id: page.id,
          evento: props["Evento"]?.title?.[0]?.plain_text || "Sin título",
          created_time: page.created_time,
          fecha: props["Fecha Inicio"]?.date?.start || null,
          fechaFin: props["Fecha Fin"]?.date?.start || null,
          departamento: props["Departamento"]?.rich_text?.[0]?.plain_text || null,
          municipio: props["Municipio"]?.rich_text?.[0]?.plain_text || null,
          categoria: props["Categoría"]?.select?.name || null,
          estado: props["Estado"]?.select?.name || null,
          fuente: props["Fuente"]?.url || null,
          imagen: props["Imagen"]?.url || props["Imagen"]?.files?.[0]?.file?.url || props["Imagen"]?.files?.[0]?.external?.url || null,
          latitud: props["Latitud"]?.number ?? (props["Latitud"]?.rich_text?.[0]?.plain_text ? parseFloat(props["Latitud"]?.rich_text?.[0]?.plain_text) : (props["Latitud"]?.title?.[0]?.plain_text ? parseFloat(props["Latitud"]?.title?.[0]?.plain_text) : null)),
          longitud: props["Longitud"]?.number ?? (props["Longitud"]?.rich_text?.[0]?.plain_text ? parseFloat(props["Longitud"]?.rich_text?.[0]?.plain_text) : (props["Longitud"]?.title?.[0]?.plain_text ? parseFloat(props["Longitud"]?.title?.[0]?.plain_text) : null)),
          resumen: props["Resumen"]?.rich_text?.[0]?.plain_text || null,
        };
      });

      // Geocode missing coordinates if location is known
      const geocodedEvents = await Promise.all(events.map(async (event) => {
        if (!event.latitud || !event.longitud) {
          const queryParts = [event.municipio, event.departamento].filter(Boolean);
          if (queryParts.length > 0) {
             const query = [...queryParts, "Colombia"].join(", ");
             try {
                const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`, {
                  headers: { 'User-Agent': 'Nomadap / ais-studio' }
                });
                const geoData = await geoRes.json();
                if (geoData && geoData.length > 0) {
                   event.latitud = parseFloat(geoData[0].lat);
                   event.longitud = parseFloat(geoData[0].lon);
                }
             } catch (e) {
                console.error("Geocoding failed for", query);
             }
          }
        }
        return event;
      }));

      res.status(200).json({ success: true, data: geocodedEvents });
    } catch (error: any) {
      console.error("Error fetching Notion events:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // API Route to fetch roads from Notion
  app.get("/api/roads", async (req, res) => {
    try {
      if (!roadsDbId) {
        throw new Error("NOTION_ROADS_DATABASE_ID is not set.");
      }
      const response = await queryNotionDb(roadsDbId);

      const roads = response.results.map((page: any) => {
        const props = page.properties;
        const lat = props["Latitud"]?.number || 0;
        const lng = props["Longitud"]?.number || 0;
        return {
          id: page.id,
          title: props["Título"]?.title?.[0]?.plain_text || "Sin título",
          description: props["Descripción"]?.rich_text?.[0]?.plain_text || "",
          status: props["Estado"]?.select?.name || "restricted",
          date: props["Fecha"]?.date?.start || null,
          position: [lat, lng]
        };
      });

      res.status(200).json({ success: true, data: roads });
    } catch (error: any) {
      console.error("Error fetching Notion roads:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // API Route to fetch towns from Notion
  app.get("/api/towns", async (req, res) => {
    try {
      if (!townsDbId) {
        throw new Error("NOTION_TOWNS_DATABASE_ID is not set.");
      }
      const response = await queryNotionDb(townsDbId);

      const towns = response.results.map((page: any) => {
        const props = page.properties;
        return {
          id: page.id,
          name: props["Nombre"]?.title?.[0]?.plain_text || "Sin nombre",
          department: props["Departamento"]?.select?.name || null,
          description: props["Descripción"]?.rich_text?.[0]?.plain_text || "",
          location: props["Ubicación"]?.rich_text?.[0]?.plain_text || null,
          image: props["Imagen"]?.url || props["Imagen"]?.files?.[0]?.file?.url || props["Imagen"]?.files?.[0]?.external?.url || null,
        };
      });

      res.status(200).json({ success: true, data: towns });
    } catch (error: any) {
      console.error("Error fetching Notion towns:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // API Route to submit user reports (events or alerts) with Gemini verification
  app.post("/api/submit-user-report", async (req, res) => {
    try {
      const { type, data } = req.body;
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const prompt = `Analiza el siguiente reporte de un usuario para la aplicación de turismo y vías de Colombia. 
Determina si parece un reporte legítimo (eventos culturales, sociales, fiestas, conciertos o reportes de estado de vías en Colombia).
Si parece spam, insultos, un bot o texto sin sentido, recházalo (isValid: false).

Tipo de reporte: ${type}
Datos enviados: ${JSON.stringify(data)}

Responde ÚNICAMENTE en formato JSON con la siguiente estructura:
{ 
  "isValid": boolean, 
  "reason": "breve explicación de la decisión" 
}`;

      const aiResponse = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
      const responseText = aiResponse.text || "{}";
      const parseJSON = (str: string) => JSON.parse(str.replace(/\`\`\`[a-z]*\n?/g, "").replace(/\`\`\`/g, "").trim());
      const validation = parseJSON(responseText);

      if (!validation.isValid) {
        return res.status(400).json({ success: false, error: validation.reason || "El reporte fue marcado como spam o inválido." });
      }

      // If valid, save to Notion
      if (type === 'event') {
        await notion.pages.create({
          parent: { database_id: eventsDbId },
          properties: {
            "Evento": { title: [{ text: { content: data.title } }] },
            "Fecha Inicio": { date: { start: data.date || new Date().toISOString() } },
            "Categoría": { select: { name: "Usuario" } },
            "Estado": { select: { name: "Activo" } },
            "Fuente": { url: data.source || "https://situr.narino.gov.co/" },
            "Latitud": { number: data.position?.[0] || 0 },
            "Longitud": { number: data.position?.[1] || 0 },
            "Resumen": { rich_text: [{ text: { content: "Reportado por usuario" } }] },
            "Imagen": { url: "https://images.unsplash.com/photo-1533174000273-928d0d5b1968?w=800" } 
          }
        });
      } else if (type === 'alert') {
        const descStr = `${data.description || "Reportado por usuario"}\nCoordenadas: ${data.position?.[0]}, ${data.position?.[1]}`;
        await notion.pages.create({
          parent: { database_id: roadsDbId },
          properties: {
            "Título": { title: [{ text: { content: data.title } }] },
            "Descripción": { rich_text: [{ text: { content: descStr } }] },
            "Estado": { select: { name: data.status || "warning" } },
            "Fecha": { date: { start: data.date || new Date().toISOString() } }
          }
        });
      }

      res.status(200).json({ success: true, message: "Reporte verificado y guardado con éxito.", validation });
    } catch (error: any) {
      console.error("Error submitting user report:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // API Route to trigger scraping manually
  app.post("/api/scrape", async (req, res) => {
    try {
      const success = await scrapeEventsAndSeedNotion();
      if (success) {
        res.status(200).json({ success: true, message: "Scraping completed and Notion updated." });
      } else {
        res.status(500).json({ success: false, error: "Scraping failed." });
      }
    } catch (error: any) {
      console.error("Error triggering scrape:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Endpoint for manual scraper trigger / Vercel Cron
  app.all("/api/force-scrape", async (req, res) => {
    try {
      console.log("[Manual Trigger] Starting scraper process...");
      
      // We start it in the background so it doesn't block the HTTP request timeout
      scrapeEventsAndSeedNotion().then(success => {
        console.log(`[Manual Trigger] Scraper finished. Success: ${success}`);
      }).catch(err => {
        console.error(`[Manual Trigger] Scraper failed. Error:`, err);
      });

      res.json({ message: "Proceso de actualización de eventos e imágenes iniciado en el fondo. Esto puede tardar varios minutos." });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Background Scraper Engine (runs once an hour via node-cron)
  cron.schedule("0 * * * *", async () => {
    const startTime = new Date();
    console.log(`\n======================================================`);
    console.log(`[Motor Cron] 🟢 INICIO DE EJECUCIÓN - ${startTime.toISOString()}`);
    console.log(`======================================================`);
    try {
      console.log(`[Scraping] ⏳ Iniciando extracción de eventos y vías...`);
      const scrapeStartTime = Date.now();
      await scrapeEventsAndSeedNotion();
      const scrapeDuration = ((Date.now() - scrapeStartTime) / 1000).toFixed(2);
      console.log(`[Scraping] ✅ Completado en ${scrapeDuration}s.`);

      console.log(`[Limpieza] ⏳ Iniciando purga de registros antiguos...`);
      const pruneStartTime = Date.now();
      await pruneOldRecords();
      const pruneDuration = ((Date.now() - pruneStartTime) / 1000).toFixed(2);
      console.log(`[Limpieza] ✅ Completado en ${pruneDuration}s.`);

      const totalDuration = ((Date.now() - startTime.getTime()) / 1000).toFixed(2);
      console.log(`------------------------------------------------------`);
      console.log(`[Motor Cron] ✅ EJECUCIÓN COMPLETADA EXITOSAMENTE (${totalDuration}s)`);
      console.log(`======================================================\n`);
    } catch (err: any) {
      console.error(`------------------------------------------------------`);
      console.error(`[Motor Cron] ❌ ERROR CRÍTICO DURANTE LA EJECUCIÓN:`);
      console.error(err.stack || err.message || err);
      console.error(`======================================================\n`);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
