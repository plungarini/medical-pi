import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import 'dotenv/config';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY_DAYS = parseInt(process.env.JWT_EXPIRY_DAYS || '30', 10);

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

declare module 'fastify' {
  interface FastifyRequest {
    user: {
      userId: string;
      username: string;
    };
  }
}

export const jwtPlugin = fp(async function (fastify: FastifyInstance) {
  await fastify.register(jwt, {
    secret: JWT_SECRET,
    sign: {
      expiresIn: `${JWT_EXPIRY_DAYS}d`,
    },
  });

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });
});

export function generateToken(fastify: FastifyInstance, payload: { userId: string; username: string }): string {
  return fastify.jwt.sign(payload);
}

export function verifyToken(fastify: FastifyInstance, token: string): { userId: string; username: string } {
  return fastify.jwt.verify(token) as { userId: string; username: string };
}
