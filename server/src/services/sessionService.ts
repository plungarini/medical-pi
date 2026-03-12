import { queries, generateId, now } from "../core/db.js";
import type { Session, Message } from "../types/index.js";
import { getMessagesBySession } from "./chatService.js";
import { emitLiveEvent } from "./eventService.js";

export function createSession(userId: string, title = "New Chat"): Session {
  const id = generateId();
  const createdAt = now();

  queries.createSession.run([id, userId, title, createdAt, createdAt]);

  // Initialize empty profile if doesn't exist
  const existingProfile = queries.getProfile.get([userId]);
  if (!existingProfile) {
    queries.createProfile.run([
      userId,
      JSON.stringify({
        userId,
        updatedAt: createdAt,
        demographics: {},
        currentConditions: [],
        persistentConditions: [],
        pastConditions: [],
        medications: [],
        allergies: [],
        vitals: [],
        labResults: [],
        surgeries: [],
        familyHistory: [],
        lifestyle: {},
      }),
      createdAt,
    ]);
  }

  const session = {
    id,
    userId,
    title,
    createdAt,
    updatedAt: createdAt,
    messageCount: 0,
    pinned: false,
  };

  emitLiveEvent(userId, "session:created", session);
  return session;
}

export function getSessionsByUser(userId: string, page = 1, limit = 20): Session[] {
  const offset = (page - 1) * limit;
  const rows = queries.getSessionsByUser.all([userId, limit, offset]) as Array<{
    id: string;
    user_id: string;
    title: string;
    created_at: string;
    updated_at: string;
    message_count: number;
    pinned: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count,
    pinned: Boolean(row.pinned),
  }));
}

export function getSessionById(sessionId: string): (Session & { messages: Message[] }) | null {
  const row = queries.getSessionById.get([sessionId]) as
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

  if (!row) {
    return null;
  }

  const messages = getMessagesBySession(sessionId);

  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count,
    pinned: Boolean(row.pinned),
    messages,
  };
}

export function updateSession(
  sessionId: string,
  updates: { title?: string; pinned?: boolean }
): Session | null {
  const existing = queries.getSessionById.get([sessionId]) as
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

  if (!existing) {
    return null;
  }

  queries.updateSession.run([
    updates.title ?? null,
    updates.pinned !== undefined ? (updates.pinned ? 1 : 0) : null,
    now(),
    sessionId,
  ]);

  const updatedSession = {
    id: existing.id,
    userId: existing.user_id,
    title: updates.title ?? existing.title,
    createdAt: existing.created_at,
    updatedAt: now(),
    messageCount: existing.message_count,
    pinned: updates.pinned !== undefined ? updates.pinned : Boolean(existing.pinned),
  };

  emitLiveEvent(existing.user_id, "session:updated", updatedSession);
  return updatedSession;
}

export function deleteSession(sessionId: string): boolean {
  const existing = queries.getSessionById.get([sessionId]) as { user_id: string } | undefined;
  if (!existing) {
    return false;
  }

  queries.deleteSession.run([sessionId]);
  emitLiveEvent(existing.user_id, "session:deleted", { id: sessionId });
  return true;
}
