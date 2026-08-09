import { ApiError } from "@/middleware/errorHandler";

export const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

export const DEFAULT_MAX_IMAGE_SIZE_MB = 5;

export interface ImageFileLike {
  mimeType: string;
  size: number;
}

/**
 * Validates an image upload (type + size). Max size is configurable.
 */
export function validateImageFile(
  file: ImageFileLike,
  opts: { maxSizeMb?: number } = {},
): void {
  const maxSizeMb = opts.maxSizeMb ?? DEFAULT_MAX_IMAGE_SIZE_MB;

  if (!IMAGE_MIME_TYPES.has(file.mimeType)) {
    throw new ApiError(
      400,
      "INVALID_FILE_TYPE",
      `Only image types are allowed: ${[...IMAGE_MIME_TYPES].join(", ")}`,
    );
  }
  if (file.size <= 0) {
    throw new ApiError(400, "EMPTY_FILE", "File is empty");
  }
  if (file.size > maxSizeMb * 1024 * 1024) {
    throw new ApiError(
      400,
      "FILE_TOO_LARGE",
      `File exceeds the ${maxSizeMb} MB size limit`,
    );
  }
}

/**
 * Detects the real image format from file signature (magic bytes), never from
 * the client-supplied MIME type or filename extension. Returns a canonical
 * MIME type, or null when the bytes do not match a supported image format.
 *
 * - JPEG:  FF D8 FF
 * - PNG:   89 50 4E 47 0D 0A 1A 0A
 * - WebP:  "RIFF" .... "WEBP"
 * - HEIC:  ISO-BMFF box with a `ftyp` brand of heic/heif/mif1
 */
export function sniffImageMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.subarray(0, 8).equals(pngSig)) return "image/png";

  // WebP: "RIFF" + size + "WEBP"
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }

  // HEIC/HEIF: ISO-BMFF "ftyp" box
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii");
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) {
      return "image/heic";
    }
  }

  return null;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

/** Extension derived from the sniffed MIME type — never from the file name. */
export function extensionForMime(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? "bin";
}
