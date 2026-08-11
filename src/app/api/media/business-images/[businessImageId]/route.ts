import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAuth } from "@/middleware/auth";
import { removeBusinessImage } from "@/modules/business/business.service";
import { noContent } from "@/lib/response";

export const runtime = "nodejs";

type Params = { params: Promise<{ businessImageId: string }> };

/**
 * @swagger
 * /api/media/business-images/{businessImageId}:
 *   delete:
 *     summary: Delete one business image
 *     description: >-
 *       Removes the business-image join row and the underlying media file, but
 *       only when the owning business belongs to the requesting user. Foreign
 *       or missing ids return an identical 404 (no existence leak).
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: businessImageId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '204':
 *         description: Deleted
 *       '401':
 *         description: Missing or invalid access token
 *       '404':
 *         description: Image not found (or owned by someone else)
 */
export const DELETE = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const { userId } = requireAuth(req);
  const { businessImageId } = await params;
  await removeBusinessImage(userId, businessImageId);
  return noContent();
});
