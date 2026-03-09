import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createDocument,
  getDocuments,
  getDocument,
  deleteDocument,
  getDocumentFile,
  extractText,
} from '../../services/documentService.js';
import { indexDocument } from '../../services/searchService.js';

const MAX_DOCUMENT_SIZE_MB = parseInt(process.env.MAX_DOCUMENT_SIZE_MB || '25', 10);
const MAX_DOCUMENT_SIZE = MAX_DOCUMENT_SIZE_MB * 1024 * 1024;

interface DocumentParams {
  id: string;
}

export async function documentsRoutes(fastify: FastifyInstance): Promise<void> {
  const authenticate = (fastify as unknown as { authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void> }).authenticate;

  // GET /api/documents
  fastify.get(
    '/',
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as unknown as { user: { userId: string } }).user;

      const documents = getDocuments(user.userId);

      return reply.send(documents);
    }
  );

  // POST /api/documents
  fastify.post(
    '/',
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as unknown as { user: { userId: string } }).user;

      const parts = request.parts?.();
      if (!parts) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }

      for await (const part of parts) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();

          if (buffer.length > MAX_DOCUMENT_SIZE) {
            return reply.code(413).send({
              error: `File too large. Maximum size is ${MAX_DOCUMENT_SIZE_MB}MB`,
            });
          }

          // Extract text for searchable content
          const extractedContent = await extractText(buffer, part.mimetype);

          const document = createDocument(
            user.userId,
            part.filename,
            part.mimetype,
            buffer,
            extractedContent || undefined
          );

          // Index in Meilisearch
          await indexDocument({
            id: document.id,
            name: document.name,
            extracted_content: document.extractedContent,
            user_id: document.userId,
            uploaded_at: document.uploadedAt,
          });

          return reply.code(201).send(document);
        }
      }

      return reply.code(400).send({ error: 'No file uploaded' });
    }
  );

  // GET /api/documents/:id
  fastify.get<{ Params: DocumentParams }>(
    '/:id',
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as unknown as { user: { userId: string } }).user;
      const { id } = request.params as DocumentParams;

      const document = getDocument(user.userId, id);

      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      return reply.send(document);
    }
  );

  // GET /api/documents/:id/download
  fastify.get<{ Params: DocumentParams }>(
    '/:id/download',
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as unknown as { user: { userId: string } }).user;
      const { id } = request.params as DocumentParams;

      const file = getDocumentFile(user.userId, id);

      if (!file) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      reply.header('Content-Type', file.mimeType);
      reply.header('Content-Disposition', `attachment; filename="${file.name}"`);

      return reply.send(file.buffer);
    }
  );

  // DELETE /api/documents/:id
  fastify.delete<{ Params: DocumentParams }>(
    '/:id',
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as unknown as { user: { userId: string } }).user;
      const { id } = request.params as DocumentParams;

      const deleted = deleteDocument(user.userId, id);

      if (!deleted) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      return reply.code(204).send();
    }
  );
}
