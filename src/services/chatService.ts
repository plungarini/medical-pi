import { db } from '../core/db.js';
import type { Session, Message, Attachment } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

export function createSession(userId: string, title = ''): Session {
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO sessions (id, user_id, title, created_at, updated_at, message_count, pinned)
     VALUES (?, ?, ?, ?, ?, 0, 0)`
  ).run(id, userId, title, now, now);

  return {
    id,
    userId,
    title,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    pinned: false,
  };
}

export function getSession(userId: string, sessionId: string): (Session & { messages: Message[] }) | null {
  const session = db
    .prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?')
    .get(sessionId, userId) as
    | {
        id: string;
        user_id: string;
        title: string;
        created_at: string;
        updated_at: string;
        message_count: number;
        pinned: number;
      }
    | undefined;

  if (!session) return null;

  const messages = db
    .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId) as Array<{
    id: string;
    session_id: string;
    role: string;
    content: string;
    attachments: string;
    tool_calls: string;
    thinking_content: string;
    created_at: string;
  }>;

  return {
    id: session.id,
    userId: session.user_id,
    title: session.title,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    messageCount: session.message_count,
    pinned: Boolean(session.pinned),
    messages: messages.map((m) => ({
      id: m.id,
      sessionId: m.session_id,
      role: m.role as 'user' | 'assistant' | 'tool',
      content: m.content,
      attachments: JSON.parse(m.attachments) as Attachment[],
      toolCalls: JSON.parse(m.tool_calls),
      thinkingContent: m.thinking_content,
      createdAt: m.created_at,
    })),
  };
}

export function getSessions(userId: string, page = 1, limit = 20): Session[] {
  const offset = (page - 1) * limit;
  const sessions = db
    .prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?')
    .all(userId, limit, offset) as Array<{
    id: string;
    user_id: string;
    title: string;
    created_at: string;
    updated_at: string;
    message_count: number;
    pinned: number;
  }>;

  return sessions.map((s) => ({
    id: s.id,
    userId: s.user_id,
    title: s.title,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    messageCount: s.message_count,
    pinned: Boolean(s.pinned),
  }));
}

export function updateSession(
  userId: string,
  sessionId: string,
  updates: { title?: string; pinned?: boolean }
): Session | null {
  const sets: string[] = [];
  const values: (string | number)[] = [];

  if (updates.title !== undefined) {
    sets.push('title = ?');
    values.push(updates.title);
  }
  if (updates.pinned !== undefined) {
    sets.push('pinned = ?');
    values.push(updates.pinned ? 1 : 0);
  }

  if (sets.length === 0) {
    return getSession(userId, sessionId);
  }

  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(sessionId);
  values.push(userId);

  const result = db
    .prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
    .run(...values);

  if (result.changes === 0) return null;

  return getSession(userId, sessionId);
}

export function deleteSession(userId: string, sessionId: string): boolean {
  const result = db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(sessionId, userId);
  return result.changes > 0;
}

export function createMessage(
  sessionId: string,
  role: 'user' | 'assistant' | 'tool',
  content: string,
  attachments: Attachment[] = [],
  toolCalls: unknown[] = [],
  thinkingContent = ''
): Message {
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO messages (id, session_id, role, content, attachments, tool_calls, thinking_content, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, sessionId, role, content, JSON.stringify(attachments), JSON.stringify(toolCalls), thinkingContent, now);

  // Update session message count and updated_at
  db.prepare(
    `UPDATE sessions SET message_count = message_count + 1, updated_at = ? WHERE id = ?`
  ).run(now, sessionId);

  return {
    id,
    sessionId,
    role,
    content,
    attachments,
    toolCalls: toolCalls as Message['toolCalls'],
    thinkingContent,
    createdAt: now,
  };
}

export function getRecentMessages(sessionId: string, limit: number): Message[] {
  const messages = db
    .prepare(
      'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?'
    )
    .all(sessionId, limit) as Array<{
    id: string;
    session_id: string;
    role: string;
    content: string;
    attachments: string;
    tool_calls: string;
    thinking_content: string;
    created_at: string;
  }>;

  return messages
    .reverse()
    .map((m) => ({
      id: m.id,
      sessionId: m.session_id,
      role: m.role as 'user' | 'assistant' | 'tool',
      content: m.content,
      attachments: JSON.parse(m.attachments) as Attachment[],
      toolCalls: JSON.parse(m.tool_calls),
      thinkingContent: m.thinking_content,
      createdAt: m.created_at,
    }));
}
