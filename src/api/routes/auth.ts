import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../core/db.js';
import { v4 as uuidv4 } from 'uuid';
import type { User, LoginRequest, LoginResponse } from '../../types/index.js';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/auth/login
  fastify.post<{ Body: LoginRequest }>('/login', async (request, reply) => {
    const { username } = request.body;

    if (!username || username.trim().length === 0) {
      return reply.code(400).send({ error: 'Username is required' });
    }

    const trimmedUsername = username.trim().toLowerCase();

    // Check if user exists
    let user = db.prepare('SELECT * FROM users WHERE username = ?').get(trimmedUsername) as
      | { id: string; username: string; created_at: string }
      | undefined;

    if (!user) {
      // Create new user
      const id = uuidv4();
      const now = new Date().toISOString();
      db.prepare('INSERT INTO users (id, username, created_at) VALUES (?, ?, ?)').run(
        id,
        trimmedUsername,
        now
      );
      user = { id, username: trimmedUsername, created_at: now };
    }

    // Generate token
    const token = fastify.jwt.sign({
      userId: user.id,
      username: user.username,
    });

    const response: LoginResponse = {
      token,
      user: {
        id: user.id,
        username: user.username,
        createdAt: user.created_at,
      },
    };

    return reply.send(response);
  });

  // GET /api/auth/me
  fastify.get(
    '/me',
    { onRequest: [(fastify as unknown as { authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void> }).authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as unknown as { user: { userId: string; username: string } }).user;

      const userData = db.prepare('SELECT * FROM users WHERE id = ?').get(user.userId) as
        | { id: string; username: string; created_at: string }
        | undefined;

      if (!userData) {
        return reply.code(404).send({ error: 'User not found' });
      }

      return reply.send({
        user: {
          id: userData.id,
          username: userData.username,
          createdAt: userData.created_at,
        },
      });
    }
  );
}
