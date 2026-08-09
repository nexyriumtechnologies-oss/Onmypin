import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAuth } from "@/middleware/auth";
import { parseUploadedImage } from "@/modules/media/multipart";
import { uploadPooledMedia } from "@/modules/media/media.service";
import { created } from "@/lib/response";

export const runtime = "nodejs";

/**
 * @swagger
 * /api/media/property-images:
 *   post:
 *     summary: Upload a property image (pool capped at 3)
 *     description: >-
 *       Uploads a single PROPERTY_IMAGE (JPEG/PNG/WebP/HEIC, max 5 MB,
 *       magic-byte validated) into the user's property-image pool. The pool
 *       holds at most 3 files: a 4th upload automatically replaces the oldest.
 *       The latest ids are the ones to pass to submit.propertyImages.
 *     tags: [Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       '201':
 *         description: Uploaded — pool count is now 1..3
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string, description: fileId for submit.propertyImages }
 *                     purpose: { type: string, enum: [PROPERTY_IMAGE] }
 *                     url: { type: string }
 *                     mimeType: { type: string }
 *                     sizeBytes: { type: integer }
 *                     createdAt: { type: string, format: date-time }
 *       '400':
 *         description: Missing file, invalid file type, or file too large
 *       '401':
 *         description: Missing or invalid access token
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const { userId } = requireAuth(req);
  const file = await parseUploadedImage(req);
  const media = await uploadPooledMedia(userId, {
    buffer: file.buffer,
    mimeType: file.mimeType,
    purpose: "PROPERTY_IMAGE",
  });
  return created(media);
});
