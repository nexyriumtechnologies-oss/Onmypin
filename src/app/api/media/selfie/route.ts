import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAuth } from "@/middleware/auth";
import { parseUploadedImage } from "@/modules/media/multipart";
import { uploadReplaceableMedia } from "@/modules/media/media.service";
import { created } from "@/lib/response";

export const runtime = "nodejs";

/**
 * @swagger
 * /api/media/selfie:
 *   post:
 *     summary: Upload your selfie (replaces any previous one)
 *     description: >-
 *       Uploads a single SELFIE image (JPEG/PNG/WebP/HEIC, max 5 MB, magic-byte
 *       validated). This is a single-slot: uploading replaces the previous
 *       selfie file, so the user always has exactly one current selfie —
 *       properties can never silently lose their selfie.
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
 *         description: Uploaded — this fileId is the user's current selfie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string, description: fileId for submit.selfieImage }
 *                     purpose: { type: string, enum: [SELFIE] }
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
  const media = await uploadReplaceableMedia(userId, { buffer: file.buffer, mimeType: file.mimeType, purpose: "SELFIE" });
  return created(media);
});
