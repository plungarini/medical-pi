import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "../api/server.js";
import type { FastifyInstance } from "fastify";

describe("Chat Service", () => {
  let app: FastifyInstance;
  let authToken: string;
  let sessionId: string;

  beforeAll(async () => {
    app = await createServer();

    // Create a user
    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: `chattest_${Date.now()}` },
    });

    const body = JSON.parse(loginResponse.body);
    authToken = body.token;

    // Create a session
    const sessionResponse = await app.inject({
      method: "POST",
      url: "/sessions",
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    const session = JSON.parse(sessionResponse.body);
    sessionId = session.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /chat/:sessionId", () => {
    it("should require authentication", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/chat/${sessionId}`,
        payload: { message: "Hello" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("should require message or attachments", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/chat/${sessionId}`,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    // Note: The actual streaming test would require more setup
    // including mocking the Modal client
  });
});
