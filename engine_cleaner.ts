import { Client } from "@notionhq/client";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), '.env.example') });

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const usersDbId = process.env.NOTION_USERS_DATABASE_ID;
const eventsDbId = process.env.NOTION_EVENTS_DATABASE_ID;

export async function pruneOldRecords() {
    console.log("[Motor de Limpieza] Iniciando purga de registros antiguos...");
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        let hasMore = true;
        let cursor = undefined;
        while (hasMore) {
            const resp = await fetch(`https://api.notion.com/v1/databases/${usersDbId}/query`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${process.env.NOTION_API_KEY}`, "Content-Type": "application/json", "Notion-Version": "2022-06-28" },
                body: JSON.stringify({ start_cursor: cursor })
            });
            const usersResp = await resp.json();
            if (!resp.ok) break;
            
            for (const user of usersResp.results || []) {
                const created = new Date(user.created_time);
                if (created < sevenDaysAgo) {
                    await notion.pages.update({ page_id: user.id, archived: true });
                    console.log(`[Motor de Limpieza] Usuario purgado: ${user.id}`);
                }
            }
            hasMore = usersResp.has_more;
            cursor = usersResp.next_cursor || undefined;
        }

        const now = new Date();
        const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
        const fifteenDaysFuture = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

        hasMore = true;
        cursor = undefined;
        while (hasMore) {
            const resp = await fetch(`https://api.notion.com/v1/databases/${eventsDbId}/query`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${process.env.NOTION_API_KEY}`, "Content-Type": "application/json", "Notion-Version": "2022-06-28" },
                body: JSON.stringify({ start_cursor: cursor })
            });
            const eventsResp = await resp.json();
            if (!resp.ok) break;

            for (const event of eventsResp.results || []) {
                const props = event.properties;
                const startD = props["Fecha Inicio"]?.date?.start ? new Date(props["Fecha Inicio"].date.start) : null;
                const endD = props["Fecha Fin"]?.date?.start ? new Date(props["Fecha Fin"].date.start) : startD;

                let toDelete = false;
                if (endD && endD < twelveHoursAgo) {
                    toDelete = true;
                }
                if (startD && startD > fifteenDaysFuture) {
                    toDelete = true;
                }

                if (toDelete) {
                    await notion.pages.update({ page_id: event.id, archived: true });
                    console.log(`[Motor de Limpieza] Evento purgado (fuera de rango): ${event.id}`);
                }
            }
            hasMore = eventsResp.has_more;
            cursor = eventsResp.next_cursor || undefined;
        }
        console.log("[Motor de Limpieza] Fin de limpieza.");
    } catch (e) {
        console.error("Error pruning records:", e);
    }
}

if (process.argv[2] === "run") {
    pruneOldRecords().then(() => process.exit(0));
}
