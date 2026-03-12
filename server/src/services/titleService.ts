import { logger } from "../core/logger.js";
import { completion } from "../core/openrouterClient.js";
import { prepare, queries, now } from "../core/db.js";

export async function generateSessionTitle(
  userMessage: string,
  assistantContent: string
): Promise<string> {
  try {
    const prompt = `Given this medical conversation, generate a concise 3-5 word title that summarizes the main topic.

User: ${userMessage.substring(0, 500)}
Assistant: ${assistantContent.substring(0, 500)}

Title (3-5 words only):`;

    const title = await completion([
      { role: "system", content: "You generate concise, descriptive titles for medical conversations." },
      { role: "user", content: prompt },
    ]);

    return title.trim().replace(/^["']|["']$/g, "");
  } catch (error) {
    logger.error("Failed to generate session title", error);
    return "Medical Consultation";
  }
}

export async function repairEmptyTitles(): Promise<number> {
  try {
    // Find sessions with empty or default titles
    const rows = prepare(
      `SELECT s.id, s.user_id, m.content as first_message
       FROM sessions s
       JOIN messages m ON m.session_id = s.id
       WHERE s.title = '' OR s.title = 'New Chat'
       AND m.role = 'user'
       GROUP BY s.id
       ORDER BY m.created_at ASC
       LIMIT 50`
    ).all() as Array<{ id: string; user_id: string; first_message: string }>;

    let repaired = 0;
    for (const row of rows) {
      try {
        const title = await generateSessionTitle(row.first_message, "");
        queries.updateSession.run([title, null, now(), row.id]);
        repaired++;
      } catch (error) {
        logger.error(`Failed to repair title for session ${row.id}`, error);
      }
    }

    logger.info(`Repaired ${repaired} session titles`);
    return repaired;
  } catch (error) {
    logger.error("Failed to repair empty titles", error);
    return 0;
  }
}
