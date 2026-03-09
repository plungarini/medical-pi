import { MeiliSearch } from 'meilisearch';
import 'dotenv/config';

const MEILISEARCH_HOST = process.env.MEILISEARCH_HOST || 'http://127.0.0.1:7700';

export const searchClient = new MeiliSearch({
  host: MEILISEARCH_HOST,
});

export const MESSAGES_INDEX = 'messages';
export const DOCUMENTS_INDEX = 'documents';

export async function initializeIndexes(): Promise<void> {
  try {
    // Create messages index if it doesn't exist
    try {
      await searchClient.getIndex(MESSAGES_INDEX);
    } catch {
      await searchClient.createIndex(MESSAGES_INDEX, { primaryKey: 'id' });
    }

    // Configure messages index
    const messagesIndex = searchClient.index(MESSAGES_INDEX);
    await messagesIndex.updateSettings({
      searchableAttributes: ['content', 'session_title'],
      filterableAttributes: ['session_id', 'user_id', 'role', 'created_at'],
      sortableAttributes: ['created_at'],
    });

    // Create documents index if it doesn't exist
    try {
      await searchClient.getIndex(DOCUMENTS_INDEX);
    } catch {
      await searchClient.createIndex(DOCUMENTS_INDEX, { primaryKey: 'id' });
    }

    // Configure documents index
    const documentsIndex = searchClient.index(DOCUMENTS_INDEX);
    await documentsIndex.updateSettings({
      searchableAttributes: ['name', 'extracted_content'],
      filterableAttributes: ['user_id', 'uploaded_at'],
      sortableAttributes: ['uploaded_at'],
    });

    console.log('Meilisearch indexes initialized');
  } catch (error) {
    console.error('Failed to initialize Meilisearch indexes:', error);
    throw error;
  }
}

export interface MessageDocument {
  id: string;
  content: string;
  session_id: string;
  session_title: string;
  user_id: string;
  role: string;
  created_at: number; // Unix timestamp for Meilisearch
}

export interface DocumentIndex {
  id: string;
  name: string;
  extracted_content?: string;
  user_id: string;
  uploaded_at: number; // Unix timestamp
}
