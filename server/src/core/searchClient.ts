import { logger } from "./logger.js";

const MEILISEARCH_HOST = process.env.MEILISEARCH_HOST ?? "http://127.0.0.1:7700";

interface SearchHit {
  id: string;
  [key: string]: unknown;
}

interface SearchResponse {
  hits: SearchHit[];
  query: string;
  estimatedTotalHits?: number;
  totalHits?: number;
}

export async function searchMessages(
  query: string,
  options: {
    sessionId?: string;
    userId?: string;
    after?: string;
    before?: string;
    limit?: number;
  } = {}
): Promise<SearchResponse> {
  try {
    const filters: string[] = [];
    if (options.sessionId) filters.push(`session_id = "${options.sessionId}"`);
    if (options.userId) filters.push(`user_id = "${options.userId}"`);
    if (options.after) filters.push(`created_at >= ${new Date(options.after).getTime()}`);
    if (options.before) filters.push(`created_at <= ${new Date(options.before).getTime()}`);

    const searchParams = new URLSearchParams({
      q: query,
      limit: String(options.limit ?? 20),
    });

    if (filters.length > 0) {
      searchParams.append("filter", filters.join(" AND "));
    }

    const response = await fetch(`${MEILISEARCH_HOST}/indexes/messages/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: query,
        limit: options.limit ?? 20,
        filter: filters.length > 0 ? filters.join(" AND ") : undefined,
      }),
    });

    if (!response.ok) {
      throw new Error(`Meilisearch error: ${response.status}`);
    }

    const data = (await response.json()) as SearchResponse;
    return data;
  } catch (error) {
    logger.error("Search messages error", error);
    return { hits: [], query };
  }
}

export async function searchDocuments(
  query: string,
  options: { userId?: string; limit?: number } = {}
): Promise<SearchResponse> {
  try {
    const filters: string[] = [];
    if (options.userId) filters.push(`user_id = "${options.userId}"`);

    const response = await fetch(`${MEILISEARCH_HOST}/indexes/documents/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: query,
        limit: options.limit ?? 10,
        filter: filters.length > 0 ? filters.join(" AND ") : undefined,
      }),
    });

    if (!response.ok) {
      throw new Error(`Meilisearch error: ${response.status}`);
    }

    const data = (await response.json()) as SearchResponse;
    return data;
  } catch (error) {
    logger.error("Search documents error", error);
    return { hits: [], query };
  }
}

export async function indexMessages(
  messages: Array<{
    id: string;
    session_id: string;
    user_id: string;
    role: string;
    content: string;
    session_title?: string;
    created_at: string;
  }>
): Promise<void> {
  try {
    const response = await fetch(`${MEILISEARCH_HOST}/indexes/messages/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        messages.map((m) => ({
          id: m.id,
          session_id: m.session_id,
          user_id: m.user_id,
          role: m.role,
          content: m.content,
          session_title: m.session_title ?? "",
          created_at: new Date(m.created_at).getTime(),
        }))
      ),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Meilisearch index error: ${response.status} - ${JSON.stringify(errorData)}`);
    }
  } catch (error) {
    logger.error("Index messages error", error);
  }
}

export async function indexDocuments(
  documents: Array<{
    id: string;
    user_id: string;
    name: string;
    extracted_content?: string;
    uploaded_at: string;
  }>
): Promise<void> {
  try {
    const response = await fetch(`${MEILISEARCH_HOST}/indexes/documents/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        documents.map((d) => ({
          id: d.id,
          user_id: d.user_id,
          name: d.name,
          extracted_content: d.extracted_content ?? "",
          uploaded_at: new Date(d.uploaded_at).getTime(),
        }))
      ),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Meilisearch index error: ${response.status} - ${JSON.stringify(errorData)}`);
    }
  } catch (error) {
    logger.error("Index documents error", error);
  }
}

/**
 * Initializes Meilisearch indexes and sets primary keys.
 * This helps prevent 500 errors caused by missing indexes or wrong primary keys.
 */
export async function initIndexes(): Promise<void> {
  const indexes = ["messages", "documents"];
  for (const index of indexes) {
    try {
      const response = await fetch(`${MEILISEARCH_HOST}/indexes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: index,
          primaryKey: "id",
        }),
      });

      if (response.ok) {
        logger.info(`Meilisearch index "${index}" initialized.`);
      } else {
        const data = await response.json() as any;
        if (data.code === "index_already_exists") {
          logger.debug(`Meilisearch index "${index}" already exists.`);
        } else {
          logger.warn(`Failed to initialize Meilisearch index "${index}":`, data);
        }
      }
    } catch (error) {
      logger.error(`Error initializing Meilisearch index "${index}":`, error);
    }
  }
}
