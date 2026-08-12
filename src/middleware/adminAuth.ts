import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAccessToken } from "@/lib/adminJwt";
import { getCapabilitiesForRole } from "@/lib/adminPermissions";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/middleware/errorHandler";
import type { AdminRole } from "@prisma/client";

export interface AdminAuthContext {
  adminId: string;
  role: string;
  capabilities: string[];
}

export async function requireAdminAuth(
  request: NextRequest,
  requiredCapabilities: string[],
): Promise<AdminAuthContext> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new ApiError(401, "MISSING_ADMIN_TOKEN", "Admin authorization header required");
  }

  const token = authHeader.slice(7);
  let payload;
  try {
    payload = verifyAdminAccessToken(token);
  } catch {
    throw new ApiError(401, "INVALID_ADMIN_TOKEN", "Admin token is invalid or expired");
  }

  const admin = await prisma.adminUser.findUnique({
    where: { id: payload.adminId },
    select: { id: true, role: true, isActive: true },
  });

  if (!admin || !admin.isActive) {
    throw new ApiError(401, "ADMIN_INACTIVE", "Admin account is inactive or not found");
  }

  const capabilities = getCapabilitiesForRole(admin.role as AdminRole);
  const hasAll = requiredCapabilities.every((c) => capabilities.includes(c as never));
  if (!hasAll) {
    throw new ApiError(403, "INSUFFICIENT_ADMIN_PERMISSIONS", "Insufficient admin permissions");
  }

  return { adminId: admin.id, role: admin.role, capabilities };
}

export async function optionalAdminAuth(
  request: NextRequest,
): Promise<AdminAuthContext | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAdminAccessToken(token);
    const admin = await prisma.adminUser.findUnique({
      where: { id: payload.adminId },
      select: { id: true, role: true, isActive: true },
    });
    if (!admin || !admin.isActive) {
      return null;
    }
    return { adminId: admin.id, role: admin.role, capabilities: getCapabilitiesForRole(admin.role as AdminRole) };
  } catch {
    return null;
  }
}

export function withAdminAuth(
  handler: (request: NextRequest, context: AdminAuthContext) => Promise<NextResponse>,
  requiredCapabilities: string[],
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      const context = await requireAdminAuth(request, requiredCapabilities);
      return handler(request, context);
    } catch (error) {
      if (error instanceof ApiError) {
        return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
      }
      throw error;
    }
  };
}