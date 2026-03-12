import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "../api/server.js";
import type { FastifyInstance } from "fastify";

describe("Document Routes", () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    app = await createServer();

    // Create a user
    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: `doctest_${Date.now()}` },
    });

    const body = JSON.parse(loginResponse.body);
    authToken = body.token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /documents", () => {
    it("should list user documents", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/documents",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });

    it("should return 401 without token", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/documents",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /documents/:id", () => {
    it("should return 404 for non-existent document", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/documents/nonexistent",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("DELETE /documents/:id", () => {
    it("should return 404 for non-existent document", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/documents/nonexistent",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
