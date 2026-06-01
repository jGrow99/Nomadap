import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), '.env.example') });
const notion = new Client({ auth: process.env.NOTION_API_KEY });
async function run() {
  try {
    const parentId = "36a2e434-eb2e-8055-a3e8-d11ce366e58a"; // MAPA page

    const response = await fetch('https://api.notion.com/v1/databases', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        parent: { type: "page_id", page_id: parentId },
        title: [{ type: "text", text: { content: "Monitoreo de Eventos (PRO)" } }],
        properties: {
          "Evento": { title: {} },
          "Departamento": { rich_text: {} },
          "Municipio": { rich_text: {} },
          "Fecha Inicio": { date: {} },
          "Fecha Fin": { date: {} },
          "Categoría": { select: { options: [{ name: "Carnaval", color: "red" }, { name: "Música", color: "blue" }, { name: "Gastronomía", color: "yellow" }] } },
          "Resumen": { rich_text: {} },
          "Imagen": { url: {} },
          "Latitud": { number: { format: "number" } },
          "Longitud": { number: { format: "number" } },
          "Fuente": { url: {} },
          "Estado": { select: { options: [{ name: "Activo", color: "green"}, {name: "Próximo", color: "orange"}, {name: "Finalizado", color: "gray"}] } }
        }
      })
    });
    
    if (!response.ok) {
        console.error("Error response:", await response.text());
        return;
    }

    const data = await response.json();
    console.log("NEW_PRO_EVENTS_DB_ID=" + data.id);

  } catch (e) {
    console.error(e);
  }
}
run();
