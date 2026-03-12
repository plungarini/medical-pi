import { queries, generateId, now } from "../core/db.js";
import type { Message, Attachment } from "../types/index.js";
import { emitLiveEvent } from "./eventService.js";

export interface CreateMessageInput {
  sessionId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  attachments?: Attachment[];
  toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown>; result?: unknown }>;
  thinkingContent?: string;
  metadata?: Record<string, any>;
}

export function createMessage(input: CreateMessageInput): Message {
  const id = generateId();
  const createdAt = now();

  queries.createMessage.run([
    id,
    input.sessionId,
    input.role,
    input.content,
    JSON.stringify(input.attachments ?? []),
    JSON.stringify(input.toolCalls ?? []),
    input.thinkingContent ?? "",
    JSON.stringify(input.metadata ?? {}),
    createdAt,
  ]);

  // Update session message count and updated_at
  queries.incrementMessageCount.run([createdAt, input.sessionId]);

  const msg = {
    id,
    sessionId: input.sessionId,
    role: input.role,
    content: input.content,
    attachments: input.attachments ?? [],
    toolCalls: input.toolCalls ?? [],
    thinkingContent: input.thinkingContent ?? "",
    metadata: input.metadata ?? {},
    createdAt,
  };

  const session = queries.getSessionById.get([input.sessionId]) as { user_id: string } | undefined;
  if (session?.user_id) {
    emitLiveEvent(session.user_id, "message:created", msg);
  }

  return msg;
}

export function getMessagesBySession(sessionId: string, limit = 50): Message[] {
  const rows = queries.getMessagesBySessionAsc.all([sessionId, limit]) as Array<{
    id: string;
    session_id: string;
    role: string;
    content: string;
    attachments: string;
    tool_calls: string;
    thinking_content: string;
    metadata: string;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    role: row.role as "user" | "assistant" | "tool",
    content: row.content,
    attachments: JSON.parse(row.attachments) as Attachment[],
    toolCalls: JSON.parse(row.tool_calls) as Array<{
      id: string;
      name: string;
      args: Record<string, unknown>;
      result?: unknown;
    }>,
    thinkingContent: row.thinking_content,
    metadata: JSON.parse(row.metadata || "{}") as Record<string, any>,
    createdAt: row.created_at,
  }));
}

export function getRecentMessages(sessionId: string, limit = 20): Message[] {
  // Get messages in descending order (most recent first)
  const rows = queries.getMessagesBySession.all([sessionId, limit]) as Array<{
    id: string;
    session_id: string;
    role: string;
    content: string;
    attachments: string;
    tool_calls: string;
    thinking_content: string;
    metadata: string;
    created_at: string;
  }>;

  // Reverse to get ascending order (oldest first) for context
  return rows
    .reverse()
    .map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      role: row.role as "user" | "assistant" | "tool",
      content: row.content,
      attachments: JSON.parse(row.attachments) as Attachment[],
      toolCalls: JSON.parse(row.tool_calls) as Array<{
        id: string;
        name: string;
        args: Record<string, unknown>;
        result?: unknown;
      }>,
      thinkingContent: row.thinking_content,
      metadata: JSON.parse(row.metadata || "{}") as Record<string, any>,
      createdAt: row.created_at,
    }));
}
