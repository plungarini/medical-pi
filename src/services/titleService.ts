import { complete } from '../core/openrouterClient.js';
import { db } from '../core/db.js';
import type { Session } from '../types/index.js';

export async function generateSessionTitle(userId: string, sessionId: string): Promise<string | null> {
  // Get first few messages
  const messages = db
    .prepare(
      `SELECT m.content, m.role 
       FROM messages m 
       WHERE m.session_id = ? 
       ORDER BY m.created_at ASC 
       LIMIT 5`
    )
    .all(sessionId) as Array<{ content: string; role: string }>;

  if (messages.length === 0) return null;

  const conversation = messages.map((m) => `${m.role}: ${m.content}`).join('\n');

  let promptTemplate: string;
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    promptTemplate = fs.readFileSync(path.join(__dirname, '../../prompts/session-title.txt'), 'utf-8');
  } catch {
    promptTemplate =
      'Based on this conversation, generate a short title (max 8 words):\n\n{CONVERSATION}\n\nTitle:';
  }

  const prompt = promptTemplate.replace('{CONVERSATION}', conversation);

  try {
    const title = await complete(
      [
        {
          role: 'system',
          content: 'Generate a concise, descriptive title for this medical conversation. Maximum 8 words.',
        },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.5, max_tokens: 50 }
    );

    return title.trim().replace(/^["']|["']$/g, '');
  } catch (error) {
    console.error('Failed to generate title:', error);
    return null;
  }
}

export async function repairUntitledSessions(userId: string): Promise<number> {
  // Find sessions with empty titles that have messages
  const sessions = db
    .prepare(
      `SELECT s.id 
       FROM sessions s 
       WHERE s.user_id = ? 
         AND (s.title = '' OR s.title IS NULL)
         AND s.message_count > 0
       LIMIT 10`
    )
    .all(userId) as Array<{ id: string }>;

  let repaired = 0;

  for (const { id } of sessions) {
    const title = await generateSessionTitle(userId, id);
    if (title) {
      db.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, id);
      repaired++;
    }
  }

  return repaired;
}
