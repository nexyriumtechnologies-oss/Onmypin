import { prisma } from "@/lib/prisma";
import { ApiError } from "@/middleware/errorHandler";
import { requireOwnedMedia } from "@/modules/media/media.service";

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  mobile: true,
  email: true,
  profileImage: true,
  language: true,
  accountStatus: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Loads a user's own public-ish profile. 404 if the user does not exist. */
export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "User not found");
  return user;
}

export interface UpdateMeInput {
  name?: string;
  email?: string | null;
  profileImage?: string;
  language?: string;
  accountStatus?: "ACTIVE" | "DEACTIVATED";
}

/**
 * Users can only ever update their own record (userId comes from the token).
 * `profileImage` is a previously-uploaded MediaFile id: it must belong to this
 * user with purpose PROFILE_IMAGE, and the resolved storage URL is persisted.
 */
export async function updateMe(userId: string, input: UpdateMeInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "User not found");
  if (user.accountStatus === "DELETED") {
    throw new ApiError(403, "ACCOUNT_DELETED", "Account is deleted and cannot be modified");
  }
  if (user.accountStatus === "DEACTIVATED" && input.accountStatus === undefined) {
    throw new ApiError(403, "ACCOUNT_DEACTIVATED", "Account is deactivated. Reactivate it first");
  }

  const data: Record<string, unknown> = { ...input };
  if (input.profileImage !== undefined) {
    const { url } = await requireOwnedMedia(userId, input.profileImage, "PROFILE_IMAGE");
    data.profileImage = url;
  }

  return prisma.user.update({ where: { id: userId }, data, select: PUBLIC_FIELDS });
}

/** Soft-delete: mark DELETED and revoke all sessions/refresh tokens. */
export async function deleteMe(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "User not found");

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { accountStatus: "DELETED" },
    }),
    prisma.refreshToken.updateMany({ where: { userId }, data: { revoked: true, revokedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId } }),
  ]);
}
