import { Readable } from "node:stream";
import busboy from "busboy";
import type { NextRequest } from "next/server";
import { ApiError } from "@/middleware/errorHandler";
import { DEFAULT_MAX_IMAGE_SIZE_MB, sniffImageMime, validateImageFile } from "./file.validation";

export interface ParsedFile {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}

export interface ParsedMultipart {
  fields: Record<string, string>;
  file: ParsedFile | null;
}

export interface MultipartLimits {
  /** Stream-level cap: busboy stops accepting data past this — the file is
   *  never fully buffered in memory once it exceeds the limit. */
  maxFileSizeBytes: number;
  maxFields: number;
  maxFieldSize: number;
}

export const UPLOAD_LIMITS: MultipartLimits = {
  maxFileSizeBytes: DEFAULT_MAX_IMAGE_SIZE_MB * 1024 * 1024,
  maxFields: 4,
  maxFieldSize: 256,
};

/**
 * Parses a multipart/form-data request with busboy. Exactly one file is
 * collected; the size cap is enforced DURING streaming (busboy aborts the
 * file stream past `fileSize`, so oversized uploads never load fully into
 * memory). Fields are limited in count and size.
 */
export function parseMultipartUpload(
  req: NextRequest,
  limits: MultipartLimits = UPLOAD_LIMITS,
): Promise<ParsedMultipart> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {};
    let file: ParsedFile | null = null;
    let sizeExceeded = false;

    const contentType = req.headers.get("content-type");
    if (!contentType || !contentType.includes("multipart/form-data")) {
      reject(new ApiError(400, "INVALID_CONTENT_TYPE", "Expected multipart/form-data"));
      return;
    }

    const parser = busboy({
      headers: { "content-type": contentType },
      limits: {
        fileSize: limits.maxFileSizeBytes,
        files: 1,
        fields: limits.maxFields,
        fieldSize: limits.maxFieldSize,
      },
    });

    parser.on("field", (name, value) => {
      fields[name] = value;
    });

    parser.on("file", (name, stream, info) => {
      const chunks: Buffer[] = [];
      let received = 0;

      stream.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > limits.maxFileSizeBytes) {
          sizeExceeded = true;
          stream.resume(); // drain — busboy already stopped delivery at the cap
          return;
        }
        chunks.push(chunk);
      });

      stream.on("limit", () => {
        sizeExceeded = true;
      });

      stream.on("end", () => {
        if (!sizeExceeded) {
          file = {
            buffer: Buffer.concat(chunks),
            mimeType: info.mimeType,
            originalName: info.filename ?? "",
          };
        }
      });
    });

    parser.on("error", (err) => {
      const message = err instanceof Error ? err.message : String(err);
      reject(
        /limit/i.test(message)
          ? new ApiError(413, "FILE_TOO_LARGE", `File exceeds the ${limits.maxFileSizeBytes / (1024 * 1024)} MB limit`)
          : new ApiError(400, "MALFORMED_UPLOAD", "Could not parse the multipart body"),
      );
    });

    parser.on("close", () => {
      if (sizeExceeded) {
        reject(
          new ApiError(413, "FILE_TOO_LARGE", `File exceeds the ${limits.maxFileSizeBytes / (1024 * 1024)} MB limit`),
        );
        return;
      }
      resolve({ fields, file });
    });

    const body = req.body as ReadableStream<Uint8Array> | null;
    if (!body) {
      reject(new ApiError(400, "EMPTY_BODY", "Request body is empty"));
      return;
    }
    Readable.fromWeb(body as never).pipe(parser);
  });
}

/**
 * Convenience for the dedicated media routes: parses the multipart body,
 * requires a `file` field, and returns a validated image buffer whose MIME
 * comes from magic-byte sniffing (never the client MIME/extension).
 */
export async function parseUploadedImage(req: NextRequest): Promise<ParsedFile> {
  const parsed = await parseMultipartUpload(req);
  if (!parsed.file) {
    throw new ApiError(400, "FILE_REQUIRED", "A file is required");
  }
  const mimeType = sniffImageMime(parsed.file.buffer);
  if (!mimeType) {
    throw new ApiError(
      400,
      "INVALID_FILE_TYPE",
      "File content does not match a supported image format (JPEG, PNG, WebP, HEIC)",
    );
  }
  validateImageFile({ mimeType, size: parsed.file.buffer.length });
  return { buffer: parsed.file.buffer, mimeType, originalName: "" };
}
