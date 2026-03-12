import type { FastifyInstance } from "fastify";
import {
  createSession,
  getSessionsByUser,
  getSessionById,
  updateSession,
  deleteSession,
} from "../../services/sessionService.js";
import { logger } from "../../core/logger.js";

export default async function sessionRoutes(fastify: FastifyInstance) {
  // GET /sessions
  fastify.get("/", async (request, reply) => {
    if (!request.user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    const { page, limit } = request.query as { page?: string; limit?: string };
    const sessions = getSessionsByUser(
      request.user.userId,
      parseInt(page ?? "1", 10),
      parseInt(limit ?? "20", 10)
    );

    reply.send(sessions);
  });

  // POST /sessions
  fastify.post("/", async (request, reply) => {
    if (!request.user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    try {
      const session = createSession(request.user.userId);
      reply.status(201).send(session);
    } catch (error) {
      logger.error("Create session error", error);
      reply.status(500).send({ error: "Failed to create session" });
    }
  });

  // GET /sessions/:id
  fastify.get("/:id", async (request, reply) => {
    if (!request.user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    const { id } = request.params as { id: string };
    const session = getSessionById(id);

    if (!session) {
      reply.status(404).send({ error: "Session not found" });
      return;
    }

    if (session.userId !== request.user.userId) {
      reply.status(403).send({ error: "Forbidden" });
      return;
    }

    reply.send(session);
  });

  // PATCH /sessions/:id
  fastify.patch("/:id", async (request, reply) => {
    if (!request.user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    const { id } = request.params as { id: string };
    const updates = request.body as { title?: string; pinned?: boolean };

    const session = getSessionById(id);
    if (!session) {
      reply.status(404).send({ error: "Session not found" });
      return;
    }

    if (session.userId !== request.user.userId) {
      reply.status(403).send({ error: "Forbidden" });
      return;
    }

    try {
      const updated = updateSession(id, updates);
      reply.send(updated);
    } catch (error) {
      logger.error("Update session error", error);
      reply.status(500).send({ error: "Failed to update session" });
    }
  });

  // DELETE /sessions/:id
  fastify.delete("/:id", async (request, reply) => {
    if (!request.user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    const { id } = request.params as { id: string };
    const session = getSessionById(id);

    if (!session) {
      reply.status(404).send({ error: "Session not found" });
      return;
    }

    if (session.userId !== request.user.userId) {
      reply.status(403).send({ error: "Forbidden" });
      return;
    }

    try {
      deleteSession(id);
      reply.status(204).send();
    } catch (error) {
      logger.error("Delete session error", error);
      reply.status(500).send({ error: "Failed to delete session" });
    }
  });
}
