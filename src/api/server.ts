import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import { authRoutes } from './routes/auth.js';
import { sessionsRoutes } from './routes/sessions.js';
import { chatRoutes } from './routes/chat.js';
import { profileRoutes } from './routes/profile.js';
import { documentsRoutes } from './routes/documents.js';
import { searchRoutes } from './routes/search.js';
import { healthRoutes } from './routes/health.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3003', 10);
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

export async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: 'info',
    },
  });

  // Register plugins
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  await fastify.register(jwt, {
    secret: JWT_SECRET,
  });

  await fastify.register(multipart, {
    limits: {
      fileSize: parseInt(process.env.MAX_DOCUMENT_SIZE_MB || '25', 10) * 1024 * 1024,
    },
  });

  // Authentication decorator
  fastify.decorate('authenticate', async (request: Parameters<Parameters<typeof fastify['hook']>[1]>[0], reply: Parameters<Parameters<typeof fastify['hook']>[1]>[1]) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // Register routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(sessionsRoutes, { prefix: '/api/sessions' });
  await fastify.register(chatRoutes, { prefix: '/api/chat' });
  await fastify.register(profileRoutes, { prefix: '/api/profile' });
  await fastify.register(documentsRoutes, { prefix: '/api/documents' });
  await fastify.register(searchRoutes, { prefix: '/api/search' });
  await fastify.register(healthRoutes, { prefix: '/health' });

  // Serve static UI files in production
  if (process.env.NODE_ENV === 'production') {
    await fastify.register(staticPlugin, {
      root: path.join(__dirname, '../../ui/dist'),
      prefix: '/',
    });

    fastify.get('/', async (_request, reply) => {
      return reply.sendFile('index.html');
    });
  }

  return fastify;
}

export async function startServer() {
  const fastify = await buildServer();

  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Server listening on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  return fastify;
}
