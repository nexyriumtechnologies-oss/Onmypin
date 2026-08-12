import { prisma } from "@/lib/prisma";
import { hashAdminPassword, verifyAdminPassword } from "@/lib/adminPassword";
import { signAdminAccessToken, signAdminRefreshToken, verifyAdminRefreshToken, hashToken } from "@/lib/adminJwt";
import { ApiError } from "@/middleware/errorHandler";
import { randomBytes } from "crypto";
import type { AdminRole } from "@prisma/client";

const ADMIN_ACCESS_TTL_MS = 15 * 60 * 1000;
const ADMIN_REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AdminLoginResult {
  admin: {
    id: string;
    email: string;
    name: string | null;
    role: string;
  };
  accessToken: string;
  refreshToken: string;
}

export async function adminLogin(
  email: string,
  password: string,
  request?: Request,
): Promise<AdminLoginResult> {
  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin) {
    throw new ApiError(401, "INVALID_ADMIN_CREDENTIALS", "Invalid email or password");
  }
  if (!admin.isActive) {
    throw new ApiError(401, "ADMIN_INACTIVE", "Admin account is inactive");
  }

  const valid = verifyAdminPassword(password, admin.passwordHash);
  if (!valid) {
    throw new ApiError(401, "INVALID_ADMIN_CREDENTIALS", "Invalid email or password");
  }

  const session = await prisma.adminSession.create({
    data: {
      adminId: admin.id,
      deviceInfo: request ? getDeviceInfo(request) : null,
      expiresAt: new Date(Date.now() + ADMIN_ACCESS_TTL_MS),
    },
  });

  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashToken(refreshToken);

  await prisma.adminRefreshToken.create({
    data: {
      adminId: admin.id,
      sessionId: session.id,
      tokenHash: refreshTokenHash,
      expiresAt: new Date(Date.now() + ADMIN_REFRESH_TTL_MS),
    },
  });

  const accessToken = signAdminAccessToken({ adminId: admin.id, role: admin.role });
  const signedRefreshToken = signAdminRefreshToken({
    adminId: admin.id,
    sessionId: session.id,
    jti: refreshToken,
  });

  return {
    admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    accessToken,
    refreshToken: signedRefreshToken,
  };
}

export async function adminRefresh(refreshToken: string): Promise<AdminLoginResult> {
  const payload = verifyAdminRefreshToken(refreshToken);

  const storedToken = await prisma.adminRefreshToken.findUnique({
    where: { tokenHash: hashToken(payload.jti) },
    include: { session: true },
  });

  if (!storedToken || storedToken.revoked || storedToken.adminId !== payload.adminId) {
    await revokeAdminSessionFamily(payload.sessionId, payload.adminId);
    throw new ApiError(401, "TOKEN_REUSE_DETECTED", "Token reuse detected; session revoked");
  }

  if (storedToken.expiresAt < new Date()) {
    throw new ApiError(401, "REFRESH_TOKEN_EXPIRED", "Refresh token has expired");
  }

  await prisma.adminRefreshToken.update({
    where: { id: storedToken.id },
    data: { revoked: true, revokedAt: new Date() },
  });

  const admin = await prisma.adminUser.findUnique({
    where: { id: payload.adminId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  if (!admin || !admin.isActive) {
    throw new ApiError(401, "ADMIN_INACTIVE", "Admin account is inactive");
  }

  const newSession = await prisma.adminSession.create({
    data: {
      adminId: admin.id,
      deviceInfo: storedToken.session.deviceInfo,
      expiresAt: new Date(Date.now() + ADMIN_ACCESS_TTL_MS),
    },
  });

  const newRefreshToken = generateRefreshToken();
  const newRefreshTokenHash = hashToken(newRefreshToken);

  await prisma.adminRefreshToken.create({
    data: {
      adminId: admin.id,
      sessionId: newSession.id,
      tokenHash: newRefreshTokenHash,
      expiresAt: new Date(Date.now() + ADMIN_REFRESH_TTL_MS),
    },
  });

  const newAccessToken = signAdminAccessToken({ adminId: admin.id, role: admin.role });
  const newSignedRefreshToken = signAdminRefreshToken({
    adminId: admin.id,
    sessionId: newSession.id,
    jti: newRefreshToken,
  });

  return {
    admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    accessToken: newAccessToken,
    refreshToken: newSignedRefreshToken,
  };
}

export async function adminLogout(refreshToken: string): Promise<void> {
  try {
    const payload = verifyAdminRefreshToken(refreshToken);
    await prisma.adminRefreshToken.updateMany({
      where: { tokenHash: hashToken(payload.jti), adminId: payload.adminId },
      data: { revoked: true, revokedAt: new Date() },
    });
    await prisma.adminSession.updateMany({
      where: { id: payload.sessionId, adminId: payload.adminId },
      data: { expiresAt: new Date() },
    });
  } catch {
    // Ignore invalid tokens on logout
  }
}

export async function adminMe(adminId: string) {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  });
  if (!admin) {
    throw new ApiError(404, "ADMIN_NOT_FOUND", "Admin not found");
  }
  return admin;
}

export async function createAdmin(data: {
  email: string;
  password: string;
  name?: string;
  role: string;
}) {
  const existing = await prisma.adminUser.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new ApiError(409, "ADMIN_EMAIL_EXISTS", "Admin with this email already exists");
  }
  const passwordHash = hashAdminPassword(data.password);
  const admin = await prisma.adminUser.create({
    data: { email: data.email, passwordHash, name: data.name, role: data.role as AdminRole },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  });
  return admin;
}

export async function listAdmins(page = 1, pageSize = 20) {
  const [admins, total] = await Promise.all([
    prisma.adminUser.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    }),
    prisma.adminUser.count(),
  ]);
  return { admins, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function updateAdmin(adminId: string, data: { role?: string; isActive?: boolean }, requesterId: string) {
  const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
  if (!admin) {
    throw new ApiError(404, "ADMIN_NOT_FOUND", "Admin not found");
  }

  if (admin.id === requesterId && data.isActive === false) {
    throw new ApiError(400, "CANNOT_DEACTIVATE_SELF", "Cannot deactivate your own account");
  }

  if (admin.role === "SUPER_ADMIN" && data.role && data.role !== "SUPER_ADMIN") {
    const superAdminCount = await prisma.adminUser.count({ where: { role: "SUPER_ADMIN", isActive: true } });
    if (superAdminCount <= 1) {
      throw new ApiError(400, "LAST_SUPER_ADMIN", "Cannot demote the last SUPER_ADMIN");
    }
  }

  if (admin.role === "SUPER_ADMIN" && data.isActive === false) {
    const activeSuperAdmins = await prisma.adminUser.count({ where: { role: "SUPER_ADMIN", isActive: true } });
    if (activeSuperAdmins <= 1) {
      throw new ApiError(400, "LAST_SUPER_ADMIN", "Cannot deactivate the last SUPER_ADMIN");
    }
  }

  const updated = await prisma.adminUser.update({
    where: { id: adminId },
    data: { role: data.role as AdminRole, isActive: data.isActive },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  });
  return updated;
}

async function revokeAdminSessionFamily(sessionId: string, adminId: string): Promise<void> {
  await prisma.adminRefreshToken.updateMany({
    where: { sessionId, adminId, revoked: false },
    data: { revoked: true, revokedAt: new Date() },
  });
  await prisma.adminSession.updateMany({
    where: { id: sessionId, adminId },
    data: { expiresAt: new Date() },
  });
}

function generateRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

function getDeviceInfo(request: Request): string {
  const ua = request.headers.get("user-agent") || "";
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  return `${ua.slice(0, 200)} | ${ip}`;
}