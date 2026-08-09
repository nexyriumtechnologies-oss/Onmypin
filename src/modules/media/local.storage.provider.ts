import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ApiError } from "@/middleware/errorHandler";
import type { StorageProvider, UploadFileInput, UploadResult } from "./storage.provider";
import { logger } from "@/lib/logger";

/**
 * Dev-only local-disk storage.
 * TODO (Phase 2): replace with S3/GCS provider behind the same interface.
 */
export class LocalStorageProvider implements StorageProvider {
  // Under public/ so Next.js serves the URLs (/uploads/...) it returns.
  constructor(private baseDir = process.env.STORAGE_LOCAL_DIR ?? "./public/uploads") {}

  async uploadFile(input: UploadFileInput): Promise<UploadResult> {
    const safeKey = sanitizeKey(input.key);
    const fullPath = resolve(this.baseDir, safeKey);
    await mkdir(join(fullPath, ".."), { recursive: true });
    await writeFile(fullPath, input.buffer);
    logger.info(`LocalStorage: wrote ${fullPath} (${input.buffer.length} bytes)`);
    return {
      key: safeKey,
      url: `/uploads/${safeKey}`,
      sizeBytes: input.buffer.length,
      provider: "local",
    };
  }

  async getSignedUrl(key: string): Promise<string> {
    return `/uploads/${sanitizeKey(key)}`;
  }

  async deleteFile(key: string): Promise<void> {
    const fullPath = resolve(this.baseDir, sanitizeKey(key));
    await rm(fullPath, { force: true });
  }
}

function sanitizeKey(key: string): string {
  const cleaned = key.replace(/\.\./g, "").replace(/^\/+/, "");
  if (!cleaned) throw new ApiError(400, "INVALID_FILE_KEY", "File key is invalid");
  return cleaned;
}

export const localStorageProvider = new LocalStorageProvider();
