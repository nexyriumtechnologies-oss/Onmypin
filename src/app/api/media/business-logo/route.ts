import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAuth } from "@/middleware/auth";
import { ApiError } from "@/middleware/errorHandler";
import { parseMultipartUpload } from "@/modules/media/multipart";
import { sniffImageMime, validateImageFile } from "@/modules/media/file.validation";
import { uploadMediaFile } from "@/modules/media/media.service";
import { setBusinessLogo } from "@/modules/business/business.service";
import { created } from "@/lib/response";

export const runtime = "nodejs";

/**
 * @swagger
 * /api/media/business-logo:
 *   post:
 *     summary: Upload a business logo (single slot)
 *     description: >-
 *       Multipart form with `file` (JPEG/PNG/WebP/HEIC, max 5 MB, magic-byte
 *       validated) and `businessId` (must belong to the caller). Each business
 *       has exactly one logo — uploading again replaces the previous one (the
 *       old owned file is deleted).
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, businessId]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               businessId:
 *                 type: string
 *     responses:
 *       '201':
 *         description: Uploaded and set as logo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string, description: fileId }
 *                     purpose: { type: string, enum: [BUSINESS_LOGO] }
 *                     url: { type: string }
 *                     mimeType: { type: string }
 *                     sizeBytes: { type: integer }
 *                     createdAt: { type: string, format: date-time }
 *                     businessId: { type: string }
 *                     logoFileId: { type: string }
 *       '400':
 *         description: Missing/invalid file or businessId
 *       '401':
 *         description: Missing or invalid access token
 *       '404':
 *         description: Business not found (or owned by someone else)
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const { userId } = requireAuth(req);
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

  const businessId = parsed.fields["businessId"];
  if (!businessId) {
    throw new ApiError(400, "BUSINESS_REQUIRED", "businessId field is required");
  }

  const media = await uploadMediaFile(userId, {
    buffer: parsed.file.buffer,
    mimeType,
    purpose: "BUSINESS_LOGO",
  });
  const business = await setBusinessLogo(userId, businessId, media.id);
  return created({ ...media, ...business });
});
