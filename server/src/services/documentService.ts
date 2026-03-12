import { queries, generateId, now } from "../core/db.js";
import { logger } from "../core/logger.js";
import type { MedicalDocument } from "../types/index.js";
import fs from "node:fs";
import path from "node:path";

const BASE_STORAGE_PATH = process.env.BASE_STORAGE_PATH ?? "./data";
const DOCUMENTS_PATH = path.join(BASE_STORAGE_PATH, "documents");

// Ensure documents directory exists
if (!fs.existsSync(DOCUMENTS_PATH)) {
  fs.mkdirSync(DOCUMENTS_PATH, { recursive: true });
}

export interface UploadDocumentInput {
  userId: string;
  name: string;
  mimeType: string;
  buffer: Buffer;
}

export async function uploadDocument(input: UploadDocumentInput): Promise<MedicalDocument> {
  const id = generateId();
  const uploadedAt = now();

  // Save file to disk
  const filePath = path.join(DOCUMENTS_PATH, `${id}_${input.name}`);
  fs.writeFileSync(filePath, input.buffer);

  // Create database record
  queries.createDocument.run([id, input.userId, input.name, input.mimeType, filePath, null, uploadedAt]);

  // Trigger async text extraction
  void extractText(id, filePath, input.mimeType);

  return {
    id,
    userId: input.userId,
    name: input.name,
    mimeType: input.mimeType,
    path: filePath,
    uploadedAt,
  };
}

export function getDocumentsByUser(userId: string): MedicalDocument[] {
  const rows = queries.getDocumentsByUser.all([userId]) as Array<{
    id: string;
    user_id: string;
    name: string;
    mime_type: string;
    path: string;
    extracted_content: string | null;
    uploaded_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    mimeType: row.mime_type,
    path: row.path,
    extractedContent: row.extracted_content ?? undefined,
    uploadedAt: row.uploaded_at,
  }));
}

export function getDocumentById(documentId: string): MedicalDocument | null {
  const row = queries.getDocumentById.get([documentId]) as
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

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    mimeType: row.mime_type,
    path: row.path,
    extractedContent: row.extracted_content ?? undefined,
    uploadedAt: row.uploaded_at,
  };
}

export function deleteDocument(documentId: string): boolean {
  const doc = getDocumentById(documentId);
  if (!doc) {
    return false;
  }

  // Delete file from disk
  try {
    if (fs.existsSync(doc.path)) {
      fs.unlinkSync(doc.path);
    }
  } catch (error) {
    logger.error(`Failed to delete file: ${doc.path}`, error);
  }

  // Delete from database
  queries.deleteDocument.run([documentId]);
  return true;
}

async function extractText(documentId: string, filePath: string, mimeType: string): Promise<void> {
  try {
    let extractedContent = "";

    if (mimeType === "text/plain") {
      extractedContent = fs.readFileSync(filePath, "utf-8");
    } else if (mimeType === "application/pdf") {
      // PDF text extraction would go here
      // For now, mark as pending
      extractedContent = "[PDF text extraction pending]";
    } else if (mimeType.startsWith("image/")) {
      // Image OCR would go here using MedGemma vision
      extractedContent = "[Image analysis pending]";
    } else {
      extractedContent = `[File type ${mimeType} not yet supported for text extraction]`;
    }

    queries.updateDocumentContent.run([extractedContent, documentId]);

    logger.info(`Text extracted for document ${documentId}`);
  } catch (error) {
    logger.error(`Failed to extract text for document ${documentId}`, error);
    queries.updateDocumentContent.run({
      id: documentId,
      extracted_content: `[Extraction failed: ${error instanceof Error ? error.message : "Unknown error"}]`,
    });
  }
}

export function getDocumentContent(documentId: string): string | null {
  const row = queries.getDocumentById.get([documentId]) as
    | { extracted_content: string | null }
    | undefined;

  return row?.extracted_content ?? null;
}
