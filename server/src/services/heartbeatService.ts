import cron from 'node-cron';
import { logger } from "../core/logger.js";
import { breathe } from "./profileService.js";
import { generateAndSave } from "./titleService.js";
import { prepare } from "../core/db.js";
import { indexMessages, indexDocuments } from "../core/searchClient.js";

const HEARTBEAT_ENABLED = process.env.HEARTBEAT_ENABLED !== "false";

export function startHeartbeatJobs(): void {
  if (!HEARTBEAT_ENABLED) {
    logger.info("Heartbeat jobs disabled");
    return;
  }

  // 1. Profile Review — scan last 10 sessions for missed profile info (Every Hour)
  cron.schedule(process.env.HEARTBEAT_INTERVAL ?? '0 * * * *', async () => {
    logger.info("Heartbeat: Running profile review");
    try {
      const sessions = prepare(`
        SELECT id, user_id FROM sessions
        ORDER BY updated_at DESC LIMIT 10
      `).all() as any[];

      for (const session of sessions) {
        const messages = prepare(`
          SELECT role, content FROM messages
          WHERE session_id = ? ORDER BY created_at ASC LIMIT 20
        `).all(session.id) as any[];

        if (messages.length < 2) continue;
        const exchange = messages.slice(-2); // last user+assistant pair
        await breathe(session.user_id, exchange[0].content, exchange[1].content);
      }
      logger.info("Heartbeat: Profile review completed");
    } catch (err) { logger.warn('Heartbeat: profile review failed', err); }
  });

  // 2. Title Repair — generate titles for sessions with empty title (2 AM)
  cron.schedule(process.env.TITLE_REPAIR_CRON ?? '0 2 * * *', async () => {
    logger.info("Heartbeat: Running title repair");
    try {
      const untitled = prepare(`
        SELECT id FROM sessions WHERE title = '' OR title IS NULL OR title = 'New Chat' LIMIT 20
      `).all() as any[];

      for (const session of untitled) {
        await generateAndSave(session.id);
      }
      logger.info(`Heartbeat: Title repair completed for ${untitled.length} sessions`);
    } catch (err) { logger.warn('Heartbeat: title repair failed', err); }
  });

  // 3. Document Reindex (3 AM)
  cron.schedule(process.env.REINDEX_CRON ?? '0 3 * * *', async () => {
    logger.info("Heartbeat: Running document reindex");
    try {
        // Mock reindex logic - re-indexing everything
        const allDocs = prepare('SELECT id, user_id, name, extracted_content, uploaded_at FROM medical_documents').all() as any[];
        if (allDocs.length > 0) {
            await indexDocuments(allDocs.map(d => ({
                ...d,
                extracted_content: d.extracted_content ?? undefined
            })));
        }
        logger.info("Heartbeat: Document reindex completed");
    } catch (err) { logger.warn('Heartbeat: reindex failed', err); }
  });

  // 4. Meilisearch Sync (Every 15 mins)
  cron.schedule(process.env.MEILI_SYNC_CRON ?? '*/15 * * * *', async () => {
    logger.debug("Heartbeat: Running Meilisearch sync");
    try {
        // Sync messages from last 15 mins
        const recentMessages = prepare(`
            SELECT m.id, m.session_id, m.user_id, m.role, m.content, s.title as session_title, m.created_at
            FROM messages m
            JOIN sessions s ON s.id = m.session_id
            WHERE m.created_at > datetime('now', '-15 minutes')
        `).all() as any[];

        if (recentMessages.length > 0) {
            await indexMessages(recentMessages);
        }

        // Sync docs from last 15 mins
        const recentDocs = prepare(`
            SELECT id, user_id, name, extracted_content, uploaded_at
            FROM medical_documents
            WHERE uploaded_at > datetime('now', '-15 minutes')
        `).all() as any[];

        if (recentDocs.length > 0) {
            await indexDocuments(recentDocs.map(d => ({
                ...d,
                extracted_content: d.extracted_content ?? undefined
            })));
        }
    } catch (err) { logger.warn('Heartbeat: Meilisearch sync failed', err); }
  });

  logger.info("Heartbeat jobs started with node-cron");
}

export function stopHeartbeatJobs(): void {
    // node-cron doesn't have a global stop for all jobs easily without tracking them
    // but for this service, it's fine as the process typically restarts
    logger.info("Heartbeat jobs stopping (process exit expected)");
}
