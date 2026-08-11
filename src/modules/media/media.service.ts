import { prisma } from "@/lib/prisma";
import { ApiError } from "@/middleware/errorHandler";
import { generateOpaqueToken } from "@/lib/crypto";
import { getStorageProvider } from "./storage.provider";
import { extensionForMime } from "./file.validation";
import type { MediaPurpose } from "@prisma/client";

export interface UploadMediaInput {
  buffer: Buffer;
  /** Canonical MIME from magic-byte sniffing, not the client-supplied one. */
  mimeType: string;
  purpose: MediaPurpose;
}

const MEDIA_SELECT = {
  id: true,
  purpose: true,
  url: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
} as const;

/** Stores bytes via the StorageProvider and tracks the file in MediaFile. */
export async function uploadMediaFile(userId: string, input: UploadMediaInput) {
  const id = generateOpaqueToken(16);
  const storageKey = `users/${userId}/${input.purpose}/${id}.${extensionForMime(input.mimeType)}`;

  const stored = await getStorageProvider().uploadFile({
    buffer: input.buffer,
    mimeType: input.mimeType,
    originalName: "", // original names are never used in storage paths
    key: storageKey,
  });

  return prisma.mediaFile.create({
    data: {
      id,
      userId,
      purpose: input.purpose,
      storageKey: stored.key,
      url: stored.url,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
    },
    select: MEDIA_SELECT,
  });
}

/** Deletes one MediaFile (row + storage). Caller must have checked ownership. */
async function deleteMediaRow(file: { id: string; storageKey: string }): Promise<void> {
  await getStorageProvider().deleteFile(file.storageKey);
  await prisma.mediaFile.delete({ where: { id: file.id } });
}

/**
 * Upload a single-file slot (PROFILE_IMAGE / SELFIE): any previous files of
 * the same purpose are replaced, so the user always has exactly one — a
 * deleted or stale selfie can never silently fall back to an old one.
 */
export async function uploadReplaceableMedia(
  userId: string,
  input: UploadMediaInput,
): Promise<{ id: string; purpose: string; url: string; mimeType: string; sizeBytes: number; createdAt: Date }> {
  const old = await prisma.mediaFile.findMany({
    where: { userId, purpose: input.purpose },
    select: { id: true, storageKey: true },
  });
  for (const file of old) {
    await deleteMediaRow(file);
  }
  return uploadMediaFile(userId, input);
}

export const MAX_PROPERTY_IMAGES = 3;

/**
 * Upload into the property-image pool: keeps at most `MAX_PROPERTY_IMAGES`
 * files per user, evicting the oldest when the pool is full (a 4th upload
 * replaces the 1st). The pool belongs to the user; submit picks the ids.
 */
export async function uploadPooledMedia(
  userId: string,
  input: UploadMediaInput,
): Promise<{ id: string; purpose: string; url: string; mimeType: string; sizeBytes: number; createdAt: Date }> {
  const existing = await prisma.mediaFile.findMany({
    where: { userId, purpose: input.purpose },
    orderBy: { createdAt: "asc" },
    select: { id: true, storageKey: true },
  });
  while (existing.length >= MAX_PROPERTY_IMAGES) {
    const oldest = existing.shift();
    if (oldest) await deleteMediaRow(oldest);
  }
  return uploadMediaFile(userId, input);
}

/** Deletes a file only if it belongs to the requesting user. */
export async function deleteMediaFile(userId: string, fileId: string): Promise<void> {
  const file = await prisma.mediaFile.findUnique({ where: { id: fileId } });
  if (!file || file.userId !== userId) {
    // Identical 404 whether the file exists for someone else or not at all.
    throw new ApiError(404, "MEDIA_NOT_FOUND", "Media file not found");
  }
  await getStorageProvider().deleteFile(file.storageKey);
  await prisma.mediaFile.delete({ where: { id: fileId } });
}

/**
 * Deletes a file (row + storage) ONLY when it belongs to the requesting user.
 * Missing or foreign files are silently ignored — used for replacing owned
 * slots (e.g. a business logo) where a stale reference must not abort the flow.
 */
export async function deleteMediaFileIfOwned(userId: string, fileId: string): Promise<void> {
  const file = await prisma.mediaFile.findUnique({ where: { id: fileId } });
  if (!file || file.userId !== userId) return;
  await getStorageProvider().deleteFile(file.storageKey);
  await prisma.mediaFile.delete({ where: { id: file.id } });
}

/**
 * Ownership + purpose check used when attaching a previously-uploaded file
 * (profile image, property images, selfie). Returns the file's resolved URL.
 */
export async function requireOwnedMedia(
  userId: string,
  fileId: string,
  purpose: MediaPurpose,
): Promise<{ url: string }> {
  const file = await prisma.mediaFile.findUnique({ where: { id: fileId } });
  if (!file || file.userId !== userId || file.purpose !== purpose) {
    throw new ApiError(
      400,
      "INVALID_MEDIA_FILE",
      `Media file is not a valid ${purpose} for this user`,
    );
  }
  return { url: file.url };
}

/** Bulk variant for property submit's propertyImages array. */
export async function requireOwnedMediaMany(
  userId: string,
  fileIds: string[],
  purpose: MediaPurpose,
): Promise<void> {
  const files = await prisma.mediaFile.findMany({
    where: { id: { in: fileIds } },
    select: { id: true, userId: true, purpose: true },
  });
  const owned = new Set(files.filter((f) => f.userId === userId && f.purpose === purpose).map((f) => f.id));
  for (const fileId of fileIds) {
    if (!owned.has(fileId)) {
      throw new ApiError(
        400,
        "INVALID_MEDIA_FILE",
        `Media file is not a valid ${purpose} for this user`,
      );
    }
  }
}
