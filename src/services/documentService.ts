import { db } from '../core/db.js';
import { saveFile, deleteFile, getFile } from '../core/fileStore.js';
import type { MedicalDocument } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

export function createDocument(
  userId: string,
  name: string,
  mimeType: string,
  buffer: Buffer,
  extractedContent?: string
): MedicalDocument {
  const id = uuidv4();
  const now = new Date().toISOString();

  const { relativePath } = saveFile(userId, name, buffer, mimeType);

  db.prepare(
    `INSERT INTO medical_documents (id, user_id, name, mime_type, path, extracted_content, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, name, mimeType, relativePath, extractedContent || null, now);

  return {
    id,
    userId,
    name,
    mimeType,
    path: relativePath,
    extractedContent,
    uploadedAt: now,
  };
}

export function getDocuments(userId: string): MedicalDocument[] {
  const rows = db
    .prepare('SELECT * FROM medical_documents WHERE user_id = ? ORDER BY uploaded_at DESC')
    .all(userId) as Array<{
    id: string;
    user_id: string;
    name: string;
    mime_type: string;
    path: string;
    extracted_content: string | null;
    uploaded_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    name: r.name,
    mimeType: r.mime_type,
    path: r.path,
    extractedContent: r.extracted_content || undefined,
    uploadedAt: r.uploaded_at,
  }));
}

export function getDocument(userId: string, documentId: string): MedicalDocument | null {
  const row = db
    .prepare('SELECT * FROM medical_documents WHERE id = ? AND user_id = ?')
    .get(documentId, userId) as
    | {
        id: string;
        user_id: string;
        name: string;
        mime_type: string;
        path: string;
        extracted_content: string | null;
        uploaded_at: string;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    mimeType: row.mime_type,
    path: row.path,
    extractedContent: row.extracted_content || undefined,
    uploadedAt: row.uploaded_at,
  };
}

export function deleteDocument(userId: string, documentId: string): boolean {
  const doc = getDocument(userId, documentId);
  if (!doc) return false;

  deleteFile(doc.path);

  const result = db.prepare('DELETE FROM medical_documents WHERE id = ? AND user_id = ?').run(documentId, userId);

  return result.changes > 0;
}

export function getDocumentFile(userId: string, documentId: string): { buffer: Buffer; mimeType: string; name: string } | null {
  const doc = getDocument(userId, documentId);
  if (!doc) return null;

  const buffer = getFile(doc.path);
  if (!buffer) return null;

  return {
    buffer,
    mimeType: doc.mimeType,
    name: doc.name,
  };
}

export function updateExtractedContent(documentId: string, content: string): void {
  db.prepare('UPDATE medical_documents SET extracted_content = ? WHERE id = ?').run(content, documentId);
}

// Simple text extraction for PDFs (if text layer exists) and text files
export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'text/plain') {
    return buffer.toString('utf-8');
  }

  // For other types, we'd need additional libraries
  // For now, return empty and let vision model handle it
  return '';
}
