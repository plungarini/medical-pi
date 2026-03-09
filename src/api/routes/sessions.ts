import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createSession,
  getSession,
  getSessions,
  updateSession,
  deleteSession,
} from '../../services/chatService.js';

interface SessionParams {
  id: string;
}

interface SessionQuery {
  page?: string;
  limit?: string;
}

interface SessionBody {
  title?: string;
  pinned?: boolean;
}

export async function sessionsRoutes(fastify: FastifyInstance): Promise<void> {
  const authenticate = (fastify as unknown as { authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void> }).authenticate;

  // GET /api/sessions
  fastify.get<{ Querystring: SessionQuery }>(
    '/',
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as unknown as { user: { userId: string } }).user;
      const { page = '1', limit = '20' } = request.query as SessionQuery;

      const sessions = getSessions(user.userId, parseInt(page, 10), parseInt(limit, 10));

      return reply.send(sessions);
    }
  );

  // POST /api/sessions
  fastify.post(
    '/',
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as unknown as { user: { userId: string } }).user;

      const session = createSession(user.userId);

      return reply.code(201).send(session);
    }
  );

  // GET /api/sessions/:id
  fastify.get<{ Params: SessionParams }>(
    '/:id',
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as unknown as { user: { userId: string } }).user;
      const { id } = request.params as SessionParams;

      const session = getSession(user.userId, id);

      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      return reply.send(session);
    }
  );

  // PATCH /api/sessions/:id
  fastify.patch<{ Params: SessionParams; Body: SessionBody }>(
    '/:id',
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as unknown as { user: { userId: string } }).user;
      const { id } = request.params as SessionParams;
      const updates = request.body as SessionBody;

      const session = updateSession(user.userId, id, updates);

      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      return reply.send(session);
    }
  );

  // DELETE /api/sessions/:id
  fastify.delete<{ Params: SessionParams }>(
    '/:id',
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as unknown as { user: { userId: string } }).user;
      const { id } = request.params as SessionParams;

      const deleted = deleteSession(user.userId, id);

      if (!deleted) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      return reply.code(204).send();
    }
  );
}
