import type { FastifyInstance } from "fastify";
import { queries, generateId, now } from "../../core/db.js";
import { signToken } from "../../core/jwtMiddleware.js";
import { logger } from "../../core/logger.js";
import type { User } from "../../types/index.js";

export default async function authRoutes(fastify: FastifyInstance) {
  // POST /auth/login
  fastify.post("/login", async (request, reply) => {
    const { username } = request.body as { username: string };

    if (!username || typeof username !== "string" || username.length < 2) {
      reply.status(400).send({ error: "Username is required (min 2 characters)" });
      return;
    }

    try {
      // Upsert user
      let user = queries.getUserByUsername.get([username]) as
        | { id: string; username: string; created_at: string }
        | undefined;

      if (!user) {
        const id = generateId();
        const createdAt = now();
        queries.createUser.run([id, username, createdAt]);
        user = { id, username, created_at: createdAt };
        logger.info(`New user created: ${username}`);
      }

      // Create JWT token
      const token = signToken({ userId: user.id, username: user.username });

      const response: { token: string; user: User } = {
        token,
        user: {
          id: user.id,
          username: user.username,
          createdAt: user.created_at,
        },
      };

      reply.send(response);
    } catch (error) {
      logger.error("Login error", error);
      reply.status(500).send({ error: "Internal server error" });
    }
  });

  // GET /auth/me
  fastify.get("/me", async (request, reply) => {
    if (!request.user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    try {
      const user = queries.getUserById.get([request.user.userId]) as
        | { id: string; username: string; created_at: string }
        | undefined;

      if (!user) {
        reply.status(404).send({ error: "User not found" });
        return;
      }

      reply.send({
        user: {
          id: user.id,
          username: user.username,
          createdAt: user.created_at,
        } as User,
      });
    } catch (error) {
      logger.error("Get user error", error);
      reply.status(500).send({ error: "Internal server error" });
    }
  });
}
