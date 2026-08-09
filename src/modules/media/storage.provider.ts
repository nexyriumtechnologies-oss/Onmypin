/**
 * Storage abstraction — uploads never touch calling code directly.
 * Swap LocalStorageProvider for S3/GCS later via STORAGE_PROVIDER env.
 */
import { localStorageProvider } from "./local.storage.provider";

export interface UploadFileInput {
  /** Raw file bytes (already size-checked by validateImageFile). */
  buffer: Buffer;
  mimeType: string;
  /** Client-supplied original name, used for extension detection only. */
  originalName: string;
  /** Logical destination, e.g. "properties/{propertyId}/image-1.webp" */
  key: string;
}

export interface UploadResult {
  key: string;
  url: string;
  sizeBytes: number;
  provider: string;
}

export interface StorageProvider {
  uploadFile(input: UploadFileInput): Promise<UploadResult>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  deleteFile(key: string): Promise<void>;
}

export function getStorageProvider(): StorageProvider {
  const name = process.env.STORAGE_PROVIDER ?? "local";
  if (name !== "local") {
    throw new Error(
      `Storage provider "${name}" is not registered. Implement S3/GCS and register it — the interface is storage.provider.ts`,
    );
  }
  return localStorageProvider;
}
