import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import type { JWTPayload } from "../types/index.js";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY_DAYS = parseInt(process.env.JWT_EXPIRY_DAYS ?? "30", 10);

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, {
    expiresIn: `${JWT_EXPIRY_DAYS}d`,
  });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET as string) as JWTPayload;
}

// Fastify preHandler hook for auth
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip auth for health endpoint
  if (request.url === "/health") {
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    reply.status(401).send({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    request.user = payload;
  } catch (error) {
    reply.status(401).send({ error: "Invalid or expired token" });
    return;
  }
}

// Extend FastifyRequest type
declare module "fastify" {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}
