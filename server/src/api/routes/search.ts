import type { FastifyInstance } from "fastify";
import { searchMessages } from "../../core/searchClient.js";
import { logger } from "../../core/logger.js";

export default async function searchRoutes(fastify: FastifyInstance) {
  // GET /search
  fastify.get("/", async (request, reply) => {
    if (!request.user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    const { q, sessionId, after, before, limit } = request.query as {
      q: string;
      sessionId?: string;
      after?: string;
      before?: string;
      limit?: string;
    };

    if (!q) {
      reply.status(400).send({ error: "Query parameter 'q' is required" });
      return;
    }

    try {
      const results = await searchMessages(q, {
        userId: request.user.userId,
        sessionId,
        after,
        before,
        limit: limit ? parseInt(limit, 10) : 20,
      });

      reply.send(results);
    } catch (error) {
      logger.error("Search error", error);
      reply.status(500).send({ error: "Search failed" });
    }
  });
}
