import type { FastifyInstance } from "fastify";
import { liveEvents } from "../../services/eventService.js";

export default async function eventRoutes(fastify: FastifyInstance) {
  fastify.get("/", async (request, reply) => {
    if (!request.user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    const { userId } = request.user;

    // Set headers for Server-Sent Events
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.flushHeaders();

    const eventName = `user:${userId}`;

    // Listener function that pushes data to the client
    const listener = (data: unknown) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Keep the connection alive
    const keepAlive = setInterval(() => {
      reply.raw.write(": keepalive\n\n");
    }, 15000);

    // Subscribe to live events for this user
    liveEvents.on(eventName, listener);

    // Initial ping to confirm connection
    reply.raw.write(`data: ${JSON.stringify({ event: "connected" })}\n\n`);

    // Clean up when the client disconnects
    request.raw.on("close", () => {
      clearInterval(keepAlive);
      liveEvents.off(eventName, listener);
    });

    // We must return a promise that never resolves so Fastify doesn't close the connection
    return new Promise(() => {});
  });
}
