import { searchClient, MESSAGES_INDEX, DOCUMENTS_INDEX, type MessageDocument, type DocumentIndex } from '../core/searchClient.js';
import type { Message } from '../types/index.js';

export async function indexMessages(messages: Message[], sessionTitle: string, userId: string): Promise<void> {
  const documents: MessageDocument[] = messages.map((m) => ({
    id: m.id,
    content: m.content,
    session_id: m.sessionId,
    session_title: sessionTitle,
    user_id: userId,
    role: m.role,
    created_at: new Date(m.createdAt).getTime(),
  }));

  await searchClient.index(MESSAGES_INDEX).addDocuments(documents);
}

export async function indexDocument(doc: {
  id: string;
  name: string;
  extracted_content?: string;
  user_id: string;
  uploaded_at: string;
}): Promise<void> {
  const document: DocumentIndex = {
    id: doc.id,
    name: doc.name,
    extracted_content: doc.extracted_content,
    user_id: doc.user_id,
    uploaded_at: new Date(doc.uploaded_at).getTime(),
  };

  await searchClient.index(DOCUMENTS_INDEX).addDocuments([document]);
}

export interface SearchSessionsResult {
  hits: Array<{
    sessionId: string;
    sessionTitle: string;
    content: string;
    createdAt: string;
  }>;
}

export async function searchSessions(
  userId: string,
  query: string,
  limit = 10
): Promise<SearchSessionsResult> {
  const result = await searchClient.index(MESSAGES_INDEX).search(query, {
    filter: `user_id = "${userId}"`,
    limit,
    attributesToRetrieve: ['session_id', 'session_title', 'content', 'created_at'],
  });

  return {
    hits: result.hits.map((hit) => ({
      sessionId: hit.session_id as string,
      sessionTitle: hit.session_title as string,
      content: hit.content as string,
      createdAt: new Date((hit.created_at as number)).toISOString(),
    })),
  };
}

export interface SearchDocumentsResult {
  hits: Array<{
    id: string;
    name: string;
    snippet: string;
  }>;
}

export async function searchDocuments(
  userId: string,
  query: string,
  limit = 10
): Promise<SearchDocumentsResult> {
  const result = await searchClient.index(DOCUMENTS_INDEX).search(query, {
    filter: `user_id = "${userId}"`,
    limit,
    attributesToRetrieve: ['id', 'name', 'extracted_content'],
    attributesToCrop: ['extracted_content'],
    cropLength: 200,
  });

  return {
    hits: result.hits.map((hit) => ({
      id: hit.id as string,
      name: hit.name as string,
      snippet: (hit.extracted_content as string) || '',
    })),
  };
}

export async function search(
  userId: string,
  query: string,
  options: {
    sessionId?: string;
    after?: string;
    before?: string;
    limit?: number;
  } = {}
): Promise<{ hits: unknown[]; query: string }> {
  const filters: string[] = [`user_id = "${userId}"`];

  if (options.sessionId) {
    filters.push(`session_id = "${options.sessionId}"`);
  }
  if (options.after) {
    filters.push(`created_at >= ${new Date(options.after).getTime()}`);
  }
  if (options.before) {
    filters.push(`created_at <= ${new Date(options.before).getTime()}`);
  }

  const result = await searchClient.index(MESSAGES_INDEX).search(query, {
    filter: filters.join(' AND '),
    limit: options.limit || 20,
  });

  return {
    hits: result.hits,
    query,
  };
}
