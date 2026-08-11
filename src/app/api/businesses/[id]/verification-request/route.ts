import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAuth } from "@/middleware/auth";
import { ok } from "@/lib/response";
import { requestVerification } from "@/modules/business/business.service";

type Params = { params: Promise<{ id: string }> };

/**
 * @swagger
 * /api/businesses/{id}/verification-request:
 *   post:
 *     summary: Request business verification
 *     description: >-
 *       Moves a PENDING (or REJECTED) business to UNDER_REVIEW. Gate: name,
 *       category, address, city, state, at least one business image, and a
 *       contact (phone or email). Missing coordinates are geocoded from the
 *       stored address at this point (users never type coordinates).
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '200':
 *         description: Moved to UNDER_REVIEW
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 verificationStatus: { type: string, enum: [UNDER_REVIEW] }
 *                 updatedAt: { type: string, format: date-time }
 *       '400':
 *         description: Incomplete business or wrong status
 *       '401':
 *         description: Missing or invalid access token
 *       '404':
 *         description: Not found (or owned by someone else)
 */
export const POST = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const { userId } = requireAuth(req);
  const { id } = await params;
  const result = await requestVerification(userId, id);
  return ok(result);
});
