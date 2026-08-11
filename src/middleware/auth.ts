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

/**
 * Optional auth for public routes that ALSO expose owner views (e.g. business
 * detail): a valid token resolves to a userId, anything else is treated as an
 * anonymous visitor — it never throws. A garbage/expired token is deliberately
 * downgraded to "not logged in" so PUBLIC routes never 401 on a stale token.
 */
export function optionalAuth(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;
  try {
    return verifyAccessToken(token).userId;
  } catch {
    return null;
  }
}
