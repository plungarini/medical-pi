import Fastify from "fastify";
import cors from "@fastify/cors";
import { authMiddleware } from "../core/jwtMiddleware.js";
import { logger, flushOnShutdown, interceptConsole } from "../core/logger.js";

// Import routes
import authRoutes from "./routes/auth.js";
import sessionRoutes from "./routes/sessions.js";
import chatRoutes from "./routes/chat.js";
import profileRoutes from "./routes/profile.js";
import documentRoutes from "./routes/documents.js";
import searchRoutes from "./routes/search.js";
import healthRoutes from "./routes/health.js";
import eventRoutes from "./routes/events.js";

// API runs on PORT + 1000 (e.g., if PORT=3003, API runs on 4003)
const BASE_PORT = Number.parseInt(process.env.PORT ?? "3003", 10);
const API_PORT = BASE_PORT + 1000;

// Initialize logger
interceptConsole();

export async function createServer() {
  const fastify = Fastify({
    logger: false, // We use our custom logger
  });

  // Register plugins
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });


  // Register auth middleware for all routes except health and auth/login
  fastify.addHook("onRequest", async (request, reply) => {
    if (request.url === "/health" || request.url === "/auth/login") {
      return;
    }
    await authMiddleware(request, reply);
  });

  // Register routes
  await fastify.register(authRoutes, { prefix: "/auth" });
  await fastify.register(sessionRoutes, { prefix: "/sessions" });
  await fastify.register(chatRoutes, { prefix: "/chat" });
  await fastify.register(profileRoutes, { prefix: "/profile" });
  await fastify.register(documentRoutes, { prefix: "/documents" });
  await fastify.register(searchRoutes, { prefix: "/search" });
  await fastify.register(healthRoutes, { prefix: "/health" });
  await fastify.register(eventRoutes, { prefix: "/events" });

  return fastify;
}

export async function startServer() {
  const server = await createServer();

  try {
    await server.listen({ port: API_PORT, host: "0.0.0.0" });
    logger.info(`Medical-pi API running on port ${API_PORT}`);
    logger.info(`(UI should be on port ${BASE_PORT})`);

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      await flushOnShutdown();
      await server.close();
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    logger.error("Failed to start server", error);
    process.exit(1);
  }
}
