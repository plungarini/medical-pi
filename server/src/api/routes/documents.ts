import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import {
  uploadDocument,
  getDocumentsByUser,
  getDocumentById,
  deleteDocument,
  getDocumentContent,
} from "../../services/documentService.js";
import { logger } from "../../core/logger.js";

const MAX_DOCUMENT_SIZE_MB = Number.parseInt(process.env.MAX_DOCUMENT_SIZE_MB ?? "25", 10);
const MAX_DOCUMENT_SIZE_BYTES = MAX_DOCUMENT_SIZE_MB * 1024 * 1024;

export default async function documentRoutes(fastify: FastifyInstance) {
  // Register multipart only for this route plugin (scoped) — avoids global 406
  // errors on JSON-body routes like /chat/*
  await fastify.register(multipart, {
    limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES },
  });

  // GET /documents
  fastify.get("/", async (request, reply) => {
    if (!request.user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    try {
      const documents = getDocumentsByUser(request.user.userId);
      reply.send(documents);
    } catch (error) {
      logger.error("Get documents error", error);
      reply.status(500).send({ error: "Failed to get documents" });
    }
  });

  // POST /documents
  fastify.post("/", async (request, reply) => {
    if (!request.user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    try {
      const data = await request.file();
      if (!data) {
        reply.status(400).send({ error: "No file uploaded" });
        return;
      }

      const buffer = await data.toBuffer();

      if (buffer.length > MAX_DOCUMENT_SIZE_BYTES) {
        reply.status(413).send({
          error: `File too large. Maximum size is ${MAX_DOCUMENT_SIZE_MB}MB`,
        });
        return;
      }

      const document = await uploadDocument({
        userId: request.user.userId,
        name: data.filename,
        mimeType: data.mimetype,
        buffer,
      });

      reply.status(201).send(document);
    } catch (error) {
      logger.error("Upload document error", error);
      reply.status(500).send({ error: "Failed to upload document" });
    }
  });

  // GET /documents/:id
  fastify.get("/:id", async (request, reply) => {
    if (!request.user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    const { id } = request.params as { id: string };
    const document = getDocumentById(id);

    if (!document) {
      reply.status(404).send({ error: "Document not found" });
      return;
    }

    if (document.userId !== request.user.userId) {
      reply.status(403).send({ error: "Forbidden" });
      return;
    }

    reply.send(document);
  });

  // GET /documents/:id/content
  fastify.get("/:id/content", async (request, reply) => {
    if (!request.user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    const { id } = request.params as { id: string };
    const document = getDocumentById(id);

    if (!document) {
      reply.status(404).send({ error: "Document not found" });
      return;
    }

    if (document.userId !== request.user.userId) {
      reply.status(403).send({ error: "Forbidden" });
      return;
    }

    const content = getDocumentContent(id);
    reply.send({ content });
  });

  // DELETE /documents/:id
  fastify.delete("/:id", async (request, reply) => {
    if (!request.user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    const { id } = request.params as { id: string };
    const document = getDocumentById(id);

    if (!document) {
      reply.status(404).send({ error: "Document not found" });
      return;
    }

    if (document.userId !== request.user.userId) {
      reply.status(403).send({ error: "Forbidden" });
      return;
    }

    try {
      deleteDocument(id);
      reply.status(204).send();
    } catch (error) {
      logger.error("Delete document error", error);
      reply.status(500).send({ error: "Failed to delete document" });
    }
  });
}
