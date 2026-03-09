import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { search } from '../../services/searchService.js';

interface SearchQuery {
  q: string;
  sessionId?: string;
  after?: string;
  before?: string;
  limit?: string;
}

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  const authenticate = (fastify as unknown as { authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void> }).authenticate;

  // GET /api/search
  fastify.get<{ Querystring: SearchQuery }>(
    '/',
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as unknown as { user: { userId: string } }).user;
      const { q, sessionId, after, before, limit = '20' } = request.query as SearchQuery;

      if (!q) {
        return reply.code(400).send({ error: 'Query parameter q is required' });
      }

      const results = await search(user.userId, q, {
        sessionId,
        after,
        before,
        limit: parseInt(limit, 10),
      });

      return reply.send(results);
    }
  );
}
