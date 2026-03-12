import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "../api/server.js";
import type { FastifyInstance } from "fastify";

describe("Profile Routes", () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    app = await createServer();

    // Create a user and get token
    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: `profiletest_${Date.now()}` },
    });

    const body = JSON.parse(loginResponse.body);
    authToken = body.token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /profile", () => {
    it("should get user profile", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/profile",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.userId).toBeDefined();
      expect(body.demographics).toBeDefined();
      expect(Array.isArray(body.currentConditions)).toBe(true);
      expect(Array.isArray(body.medications)).toBe(true);
      expect(Array.isArray(body.allergies)).toBe(true);
    });

    it("should return 401 without token", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/profile",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("PATCH /profile", () => {
    it("should update profile", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/profile",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {
          demographics: {
            dateOfBirth: "1990-01-01",
            sex: "male",
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.demographics.dateOfBirth).toBe("1990-01-01");
      expect(body.demographics.sex).toBe("male");
    });

    it("should add condition to profile", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/profile",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {
          currentConditions: [
            {
              id: "test-condition-1",
              name: "Hypertension",
              severity: "moderate",
              source: "manual",
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.currentConditions.length).toBeGreaterThan(0);
      expect(body.currentConditions[0].name).toBe("Hypertension");
    });
  });

  describe("GET /profile/history", () => {
    it("should get profile history", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/profile/history",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });
  });
});
