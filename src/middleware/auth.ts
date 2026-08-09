import type { NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/jwt";
import { ApiError } from "@/middleware/errorHandler";

export interface AuthContext {
  userId: string;
}

/**
 * Validates the Bearer access token and returns the authenticated user id.
 * Throws ApiError(401) when the token is missing/invalid.
 */
export function requireAuth(req: NextRequest): AuthContext {
  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing or malformed Authorization header");
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing access token");
  }
  const { userId } = verifyAccessToken(token);
  return { userId };
}
