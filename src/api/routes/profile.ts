import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  getProfile,
  updateProfile,
  getProfileHistory,
  deleteProfileEntry,
} from '../../services/profileService.js';
import type { MedicalProfile } from '../../types/index.js';

interface ProfileParams {
  field: string;
  id: string;
}

export async function profileRoutes(fastify: FastifyInstance): Promise<void> {
  const authenticate = (fastify as unknown as { authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void> }).authenticate;

  // GET /api/profile
  fastify.get(
    '/',
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as unknown as { user: { userId: string } }).user;

      const profile = getProfile(user.userId);

      return reply.send(profile);
    }
  );

  // PATCH /api/profile
  fastify.patch<{ Body: Partial<MedicalProfile> }>(
    '/',
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as unknown as { user: { userId: string } }).user;
      const updates = request.body as Partial<MedicalProfile>;

      // Prevent updating userId
      delete (updates as { userId?: string }).userId;

      const profile = updateProfile(user.userId, updates);

      return reply.send(profile);
    }
  );

  // GET /api/profile/history
  fastify.get(
    '/history',
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as unknown as { user: { userId: string } }).user;

      const history = getProfileHistory(user.userId);

      return reply.send(history);
    }
  );

  // DELETE /api/profile/entry/:field/:id
  fastify.delete<{ Params: ProfileParams }>(
    '/entry/:field/:id',
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as unknown as { user: { userId: string } }).user;
      const { field, id } = request.params as ProfileParams;

      const profile = deleteProfileEntry(user.userId, field, id);

      return reply.send(profile);
    }
  );
}
