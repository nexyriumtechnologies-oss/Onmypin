import jwt, { type SignOptions } from "jsonwebtoken";
import { createHash } from "node:crypto";
import { ApiError } from "@/middleware/errorHandler";

export const ADMIN_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const ADMIN_REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface AdminAccessTokenPayload {
  adminId: string;
  role: string;
}

export interface AdminRefreshTokenPayload {
  adminId: string;
  sessionId: string;
  jti: string;
}

function getAdminSecret(): string {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new ApiError(
      500,
      "ADMIN_JWT_SECRET_MISCONFIGURED",
      "ADMIN_JWT_SECRET is missing or too short (minimum 32 characters)",
    );
  }
  return secret;
}

export function signAdminAccessToken(payload: AdminAccessTokenPayload): string {
  return jwt.sign(payload, getAdminSecret(), {
    expiresIn: ADMIN_ACCESS_TOKEN_TTL_SECONDS,
  } satisfies SignOptions);
}

export function signAdminRefreshToken(payload: AdminRefreshTokenPayload): string {
  return jwt.sign(payload, getAdminSecret(), {
    expiresIn: ADMIN_REFRESH_TOKEN_TTL_SECONDS,
  } satisfies SignOptions);
}

export function verifyAdminAccessToken(token: string): AdminAccessTokenPayload {
  try {
    const decoded = jwt.verify(token, getAdminSecret());
    if (
      typeof decoded === "string" ||
      typeof decoded.adminId !== "string" ||
      typeof decoded.role !== "string"
    ) {
      throw new Error("invalid payload");
    }
    return { adminId: decoded.adminId, role: decoded.role };
  } catch {
    throw new ApiError(401, "INVALID_ADMIN_ACCESS_TOKEN", "Admin access token is invalid or expired");
  }
}

export function verifyAdminRefreshToken(token: string): AdminRefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, getAdminSecret());
    if (
      typeof decoded === "string" ||
      typeof decoded.adminId !== "string" ||
      typeof decoded.sessionId !== "string" ||
      typeof decoded.jti !== "string"
    ) {
      throw new Error("invalid payload");
    }
    return { adminId: decoded.adminId, sessionId: decoded.sessionId, jti: decoded.jti };
  } catch {
    throw new ApiError(401, "INVALID_ADMIN_REFRESH_TOKEN", "Admin refresh token is invalid or expired");
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}