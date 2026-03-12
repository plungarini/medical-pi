import type { FastifyInstance } from "fastify";
import {
  getProfile,
  updateProfile,
  getProfileHistory,
  deleteProfileEntry,
  updateProfileEntry,
} from "../../services/profileService.js";
import { logger } from "../../core/logger.js";

export default async function profileRoutes(fastify: FastifyInstance) {
  // GET /profile
  fastify.get("/", async (request, reply) => {
    if (!request.user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    try {
      const profile = getProfile(request.user.userId);
      if (!profile) {
        reply.status(404).send({ error: "Profile not found" });
        return;
      }
      reply.send(profile);
    } catch (error) {
      logger.error("Get profile error", error);
      reply.status(500).send({ error: "Failed to get profile" });
    }
  });

  // PATCH /profile
  fastify.patch("/", async (request, reply) => {
    if (!request.user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    try {
      const updates = request.body as Record<string, unknown>;
      const profile = updateProfile(request.user.userId, updates);
      reply.send(profile);
    } catch (error) {
      logger.error("Update profile error", error);
      reply.status(500).send({ error: "Failed to update profile" });
    }
  });

  // GET /profile/history
  fastify.get("/history", async (request, reply) => {
    if (!request.user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    try {
      const history = getProfileHistory(request.user.userId);
      reply.send(history);
    } catch (error) {
      logger.error("Get profile history error", error);
      reply.status(500).send({ error: "Failed to get profile history" });
    }
  });

  // DELETE /profile/entry/:field/:id
  fastify.delete("/entry/:field/:id", async (request, reply) => {
    if (!request.user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    const { field, id } = request.params as { field: string; id: string };

    try {
      deleteProfileEntry(request.user.userId, field, id);
      reply.status(204).send();
    } catch (error) {
      logger.error("Delete profile entry error", error);
      reply.status(500).send({ error: "Failed to delete profile entry" });
    }
  });

  // PATCH /profile/entry/:field/:id
  fastify.patch("/entry/:field/:id", async (request, reply) => {
    if (!request.user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }
    const { field, id } = request.params as { field: string; id: string };
    const updates = request.body as Record<string, unknown>;
    try {
      updateProfileEntry(request.user.userId, field, id, updates);
      reply.status(204).send();
    } catch (error) {
      logger.error("Update profile entry error", error);
      reply.status(500).send({ error: "Failed to update profile entry" });
    }
  });
}
