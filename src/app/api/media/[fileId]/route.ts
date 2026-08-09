import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAuth } from "@/middleware/auth";
import { deleteMediaFile } from "@/modules/media/media.service";
import { noContent } from "@/lib/response";

export const runtime = "nodejs";

type Params = { params: Promise<{ fileId: string }> };

/**
 * @swagger
 * /api/media/{fileId}:
 *   delete:
 *     summary: Delete an uploaded file
 *     description: Deletes the file from storage and the MediaFile row, but only
 *       when it belongs to the requesting user. Foreign or missing files return
 *       an identical 404.
 *     tags: [Media]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: fileId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '204':
 *         description: Deleted
 *       '401':
 *         description: Missing or invalid access token
 *       '404':
 *         description: File not found (or owned by another user)
 */
export const DELETE = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const { userId } = requireAuth(req);
  const { fileId } = await params;
  await deleteMediaFile(userId, fileId);
  return noContent();
});
