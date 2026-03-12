import { logger } from "../core/logger.js";
import { repairEmptyTitles } from "./titleService.js";
import { indexMessages, indexDocuments } from "../core/searchClient.js";
import { prepare } from "../core/db.js";

const HEARTBEAT_ENABLED = process.env.HEARTBEAT_ENABLED !== "false";

let heartbeatInterval: NodeJS.Timeout | null = null;
let titleRepairInterval: NodeJS.Timeout | null = null;
let reindexInterval: NodeJS.Timeout | null = null;
let meiliSyncInterval: NodeJS.Timeout | null = null;

// Parse cron-like schedule to milliseconds (simplified)
function parseSchedule(schedule: string): number {
  // */15 * * * * -> 15 minutes
  // 0 * * * * -> 1 hour
  // 0 2 * * * -> 24 hours
  
  if (schedule.startsWith("*/")) {
    const minutes = parseInt(schedule.match(/\*\/(\d+)/)?.[1] ?? "15", 10);
    return minutes * 60 * 1000;
  }
  
  if (schedule === "0 * * * *") {
    return 60 * 60 * 1000; // 1 hour
  }
  
  if (schedule === "0 2 * * *" || schedule === "0 3 * * *") {
    return 24 * 60 * 60 * 1000; // 24 hours
  }
  
  return 15 * 60 * 1000; // Default 15 minutes
}

let isStarted = false;

export function startHeartbeatJobs(): void {
  if (!HEARTBEAT_ENABLED) {
    logger.info("Heartbeat jobs disabled");
    return;
  }

  // Prevent duplicate starts (e.g., during tsx hot-reload)
  if (isStarted) {
    logger.debug("Heartbeat jobs already running, skipping");
    return;
  }
  isStarted = true;

  const HEARTBEAT_INTERVAL = parseSchedule(process.env.HEARTBEAT_INTERVAL ?? "0 * * * *");
  const TITLE_REPAIR_INTERVAL = parseSchedule(process.env.TITLE_REPAIR_CRON ?? "0 2 * * *");
  const REINDEX_INTERVAL = parseSchedule(process.env.REINDEX_CRON ?? "0 3 * * *");
  const MEILI_SYNC_INTERVAL = parseSchedule(process.env.MEILI_SYNC_CRON ?? "*/15 * * * *");

  // Profile review job
  heartbeatInterval = setInterval(async () => {
    logger.info("Running profile review heartbeat");
    try {
      // Future: implement profile review logic
      logger.info("Profile review completed");
    } catch (error) {
      logger.error("Profile review failed", error);
    }
  }, HEARTBEAT_INTERVAL);

  // Title repair job
  titleRepairInterval = setInterval(async () => {
    logger.info("Running title repair job");
    try {
      const repaired = await repairEmptyTitles();
      logger.info(`Title repair completed: ${repaired} sessions repaired`);
    } catch (error) {
      logger.error("Title repair failed", error);
    }
  }, TITLE_REPAIR_INTERVAL);

  // Document reindex job
  reindexInterval = setInterval(async () => {
    logger.info("Running document reindex job");
    try {
      // Future: implement document reindexing logic
      logger.info("Document reindex completed");
    } catch (error) {
      logger.error("Document reindex failed", error);
    }
  }, REINDEX_INTERVAL);

  // Meilisearch sync job
  meiliSyncInterval = setInterval(async () => {
    logger.debug("Running Meilisearch sync");
    try {
      // Get recent messages not yet indexed
      const recentMessages = prepare(
        `SELECT m.id, m.session_id, m.user_id, m.role, m.content, s.title as session_title, m.created_at
         FROM messages m
         JOIN sessions s ON s.id = m.session_id
         WHERE m.created_at > datetime('now', '-15 minutes')`
      ).all() as Array<{
        id: string;
        session_id: string;
        user_id: string;
        role: string;
        content: string;
        session_title: string;
        created_at: string;
      }>;

      if (recentMessages.length > 0) {
        await indexMessages(recentMessages);
        logger.debug(`Indexed ${recentMessages.length} messages`);
      }

      // Get recent documents not yet indexed
      const recentDocs = prepare(
        `SELECT id, user_id, name, extracted_content, uploaded_at
         FROM medical_documents
         WHERE uploaded_at > datetime('now', '-15 minutes')`
      ).all() as Array<{
        id: string;
        user_id: string;
        name: string;
        extracted_content: string | null;
        uploaded_at: string;
      }>;

      if (recentDocs.length > 0) {
        await indexDocuments(
          recentDocs.map((d) => ({
            ...d,
            extracted_content: d.extracted_content ?? undefined,
          }))
        );
        logger.debug(`Indexed ${recentDocs.length} documents`);
      }
    } catch (error) {
      logger.error("Meilisearch sync failed", error);
    }
  }, MEILI_SYNC_INTERVAL);

  logger.info("Heartbeat jobs started");
}

export function stopHeartbeatJobs(): void {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  if (titleRepairInterval) clearInterval(titleRepairInterval);
  if (reindexInterval) clearInterval(reindexInterval);
  if (meiliSyncInterval) clearInterval(meiliSyncInterval);
  isStarted = false;
  logger.info("Heartbeat jobs stopped");
}
