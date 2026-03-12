import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer } from "../api/server.js";
import type { FastifyInstance } from "fastify";

describe("Session Routes", () => {
  let app: FastifyInstance;
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await createServer();

    // Create a user and get token
    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: `sessiontest_${Date.now()}` },
    });

    const body = JSON.parse(loginResponse.body);
    authToken = body.token;
    userId = body.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /sessions", () => {
    it("should create a new session", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/sessions",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.userId).toBe(userId);
      expect(body.title).toBeDefined();
    });

    it("should return 401 without token", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/sessions",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /sessions", () => {
    it("should list user sessions", async () => {
      // Create a session first
      await app.inject({
        method: "POST",
        url: "/sessions",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/sessions",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe("GET /sessions/:id", () => {
    it("should get session with messages", async () => {
      // Create a session
      const createResponse = await app.inject({
        method: "POST",
        url: "/sessions",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const session = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: "GET",
        url: `/sessions/${session.id}`,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(session.id);
      expect(Array.isArray(body.messages)).toBe(true);
    });

    it("should return 404 for non-existent session", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/sessions/nonexistent",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("PATCH /sessions/:id", () => {
    it("should update session title", async () => {
      // Create a session
      const createResponse = await app.inject({
        method: "POST",
        url: "/sessions",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const session = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: "PATCH",
        url: `/sessions/${session.id}`,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: { title: "Updated Title" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.title).toBe("Updated Title");
    });

    it("should pin session", async () => {
      // Create a session
      const createResponse = await app.inject({
        method: "POST",
        url: "/sessions",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const session = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: "PATCH",
        url: `/sessions/${session.id}`,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: { pinned: true },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.pinned).toBe(true);
    });
  });

  describe("DELETE /sessions/:id", () => {
    it("should delete session", async () => {
      // Create a session
      const createResponse = await app.inject({
        method: "POST",
        url: "/sessions",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const session = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: "DELETE",
        url: `/sessions/${session.id}`,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(204);

      // Verify deletion
      const getResponse = await app.inject({
        method: "GET",
        url: `/sessions/${session.id}`,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(getResponse.statusCode).toBe(404);
    });
  });
});
