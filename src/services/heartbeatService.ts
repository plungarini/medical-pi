import cron from 'node-cron';
import { repairUntitledSessions } from './titleService.js';
import { breathe } from './profileService.js';
import { db } from '../core/db.js';
import { complete } from '../core/openrouterClient.js';
import type { MessageDocument } from '../core/searchClient.js';
import { searchClient, MESSAGES_INDEX, DOCUMENTS_INDEX } from '../core/searchClient.js';
import 'dotenv/config';

const HEARTBEAT_ENABLED = process.env.HEARTBEAT_ENABLED !== 'false';
const HEARTBEAT_INTERVAL = process.env.HEARTBEAT_INTERVAL || '0 * * * *';
const TITLE_REPAIR_CRON = process.env.TITLE_REPAIR_CRON || '0 2 * * *';
const REINDEX_CRON = process.env.REINDEX_CRON || '0 3 * * *';
const MEILI_SYNC_CRON = process.env.MEILI_SYNC_CRON || '*/15 * * * *';
const WHATSAPP_SUMMARY_CRON = process.env.WHATSAPP_SUMMARY_CRON;
const WHATSAPP_PI_URL = process.env.WHATSAPP_PI_URL || 'http://127.0.0.1:3001';

let jobs: cron.ScheduledTask[] = [];

export function startHeartbeatJobs(): void {
  if (!HEARTBEAT_ENABLED) {
    console.log('Heartbeat jobs disabled');
    return;
  }

  // Profile review job
  if (HEARTBEAT_INTERVAL) {
    jobs.push(
      cron.schedule(HEARTBEAT_INTERVAL, async () => {
        console.log('Running profile review heartbeat...');
        try {
          await runProfileReview();
        } catch (error) {
          console.error('Profile review failed:', error);
        }
      })
    );
  }

  // Title repair job
  if (TITLE_REPAIR_CRON) {
    jobs.push(
      cron.schedule(TITLE_REPAIR_CRON, async () => {
        console.log('Running title repair...');
        try {
          await runTitleRepair();
        } catch (error) {
          console.error('Title repair failed:', error);
        }
      })
    );
  }

  // Document reindex job
  if (REINDEX_CRON) {
    jobs.push(
      cron.schedule(REINDEX_CRON, async () => {
        console.log('Running document reindex...');
        try {
          await runDocumentReindex();
        } catch (error) {
          console.error('Document reindex failed:', error);
        }
      })
    );
  }

  // Meilisearch sync job
  if (MEILI_SYNC_CRON) {
    jobs.push(
      cron.schedule(MEILI_SYNC_CRON, async () => {
        console.log('Running Meilisearch sync...');
        try {
          await runMeiliSync();
        } catch (error) {
          console.error('Meilisearch sync failed:', error);
        }
      })
    );
  }

  // WhatsApp summary job
  if (WHATSAPP_SUMMARY_CRON) {
    jobs.push(
      cron.schedule(WHATSAPP_SUMMARY_CRON, async () => {
        console.log('Running WhatsApp summary...');
        try {
          await runWhatsAppSummary();
        } catch (error) {
          console.error('WhatsApp summary failed:', error);
        }
      })
    );
  }

  console.log(`Started ${jobs.length} heartbeat jobs`);
}

export function stopHeartbeatJobs(): void {
  for (const job of jobs) {
    job.stop();
  }
  jobs = [];
  console.log('Stopped all heartbeat jobs');
}

async function runProfileReview(): Promise<void> {
  // Get users with recent sessions
  const users = db
    .prepare(
      `SELECT DISTINCT user_id 
       FROM sessions 
       WHERE updated_at > datetime('now', '-1 day')
       LIMIT 10`
    )
    .all() as Array<{ user_id: string }>;

  for (const { user_id } of users) {
    // Get last 10 sessions' recent messages
    const sessions = db
      .prepare(
        `SELECT id FROM sessions 
         WHERE user_id = ? 
         ORDER BY updated_at DESC 
         LIMIT 10`
      )
      .all(user_id) as Array<{ id: string }>;

    for (const { id: sessionId } of sessions) {
      // Get last exchange from each session
      const messages = db
        .prepare(
          `SELECT role, content FROM messages 
           WHERE session_id = ? 
           ORDER BY created_at DESC 
           LIMIT 2`
        )
        .all(sessionId) as Array<{ role: string; content: string }>;

      if (messages.length >= 2) {
        const userMsg = messages.find((m) => m.role === 'user');
        const assistantMsg = messages.find((m) => m.role === 'assistant');

        if (userMsg && assistantMsg) {
          await breathe(user_id, userMsg.content, assistantMsg.content);
        }
      }
    }
  }
}

async function runTitleRepair(): Promise<void> {
  const users = db.prepare('SELECT id FROM users').all() as Array<{ id: string }>;

  for (const { id } of users) {
    await repairUntitledSessions(id);
  }
}

async function runDocumentReindex(): Promise<void> {
  // This would re-extract text from documents if needed
  // For now, it's a placeholder for future OCR improvements
  console.log('Document reindex complete (no-op)');
}

async function runMeiliSync(): Promise<void> {
  // Sync any missing messages to Meilisearch
  // Get messages from last hour that might not be indexed
  const messages = db
    .prepare(
      `SELECT m.id, m.content, m.session_id, m.role, m.created_at,
              s.title as session_title, s.user_id
       FROM messages m
       JOIN sessions s ON m.session_id = s.id
       WHERE m.created_at > datetime('now', '-1 hour')`
    )
    .all() as Array<{
    id: string;
    content: string;
    session_id: string;
    role: string;
    created_at: string;
    session_title: string;
    user_id: string;
  }>;

  if (messages.length > 0) {
    const docs: MessageDocument[] = messages.map((m) => ({
      id: m.id,
      content: m.content,
      session_id: m.session_id,
      session_title: m.session_title,
      user_id: m.user_id,
      role: m.role,
      created_at: new Date(m.created_at).getTime(),
    }));

    await searchClient.index(MESSAGES_INDEX).addDocuments(docs);
    console.log(`Synced ${docs.length} messages to Meilisearch`);
  }

  // Sync documents
  const documents = db
    .prepare(
      `SELECT id, name, extracted_content, user_id, uploaded_at
       FROM medical_documents
       WHERE uploaded_at > datetime('now', '-1 hour')`
    )
    .all() as Array<{
    id: string;
    name: string;
    extracted_content: string | null;
    user_id: string;
    uploaded_at: string;
  }>;

  if (documents.length > 0) {
    const docs = documents.map((d) => ({
      id: d.id,
      name: d.name,
      extracted_content: d.extracted_content || '',
      user_id: d.user_id,
      uploaded_at: new Date(d.uploaded_at).getTime(),
    }));

    await searchClient.index(DOCUMENTS_INDEX).addDocuments(docs);
    console.log(`Synced ${docs.length} documents to Meilisearch`);
  }
}

async function runWhatsAppSummary(): Promise<void> {
  // Get summary of activity from last 24 hours
  const users = db
    .prepare(
      `SELECT DISTINCT s.user_id,
              COUNT(DISTINCT s.id) as session_count,
              COUNT(m.id) as message_count
       FROM sessions s
       LEFT JOIN messages m ON s.id = m.session_id
       WHERE s.updated_at > datetime('now', '-1 day')
       GROUP BY s.user_id`
    )
    .all() as Array<{ user_id: string; session_count: number; message_count: number }>;

  for (const user of users) {
    // Get any new profile updates
    const profileUpdates = db
      .prepare(
        `SELECT COUNT(*) as count 
         FROM profile_history 
         WHERE user_id = ? AND created_at > datetime('now', '-1 day')`
      )
      .get(user.user_id) as { count: number };

    const summary = `Medical Activity Summary (24h):
- Sessions: ${user.session_count}
- Messages: ${user.message_count}
- Profile Updates: ${profileUpdates.count}`;

    // Send to WhatsApp (fire-and-forget)
    try {
      await fetch(`${WHATSAPP_PI_URL}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: summary }),
      });
    } catch (error) {
      console.error('Failed to send WhatsApp summary:', error);
    }
  }
}
