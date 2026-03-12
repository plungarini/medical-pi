import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "../api/server.js";
import type { FastifyInstance } from "fastify";

describe("Auth Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createServer();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /auth/login", () => {
    it("should create a new user and return token", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: "testuser" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.token).toBeDefined();
      expect(body.user).toBeDefined();
      expect(body.user.username).toBe("testuser");
    });

    it("should return 400 for invalid username", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: "a" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return existing user on duplicate username", async () => {
      const username = `testuser_${Date.now()}`;
      
      // First login
      const response1 = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username },
      });
      expect(response1.statusCode).toBe(200);
      const body1 = JSON.parse(response1.body);

      // Second login with same username
      const response2 = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username },
      });
      expect(response2.statusCode).toBe(200);
      const body2 = JSON.parse(response2.body);

      expect(body1.user.id).toBe(body2.user.id);
    });
  });

  describe("GET /auth/me", () => {
    it("should return 401 without token", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/auth/me",
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
