import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAuth, optionalAuth } from "@/middleware/auth";
import { ok } from "@/lib/response";
import { patchBusinessSchema } from "@/modules/business/business.validation";
import { getBusinessDetail, updateBusiness } from "@/modules/business/business.service";

type Params = { params: Promise<{ id: string }> };

/**
 * @swagger
 * /api/businesses/{id}:
 *   get:
 *     summary: Business detail (public-safe)
 *     description: >-
 *       VERIFIED + ACTIVE businesses are public (contact info included — that is
 *       the point of verification). A non-verified business is only visible to
 *       its owner. Non-owners asking for a non-verified business get the same
 *       404 as a missing one (no existence leak).
 *     tags: [Business]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '200':
 *         description: Business detail
 *       '404':
 *         description: Not found / not yet verified (unless owner)
 *   patch:
 *     summary: Update own business
 *     description: >-
 *       Owner-only. verificationStatus can never be changed here (see
 *       POST /api/businesses/{id}/verification-request); ownerUserId is also
 *       locked. Unknown fields rejected.
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, minLength: 1, maxLength: 120 }
 *               categoryId: { type: string }
 *               subcategoryId: { type: string }
 *               address: { type: string, minLength: 5, maxLength: 500 }
 *               city: { type: string, minLength: 2, maxLength: 100 }
 *               state: { type: string, minLength: 2, maxLength: 100 }
 *               pincode: { type: string, pattern: '^\d{6}$' }
 *               latitude: { type: number, minimum: -90, maximum: 90 }
 *               longitude: { type: number, minimum: -180, maximum: 180 }
 *               contactPhone: { type: string }
 *               contactEmail: { type: string, format: email }
 *               status: { type: string, enum: [ACTIVE, INACTIVE] }
 *     responses:
 *       '200':
 *         description: Updated business (full owner view)
 *       '400':
 *         description: Invalid payload / forbidden field
 *       '401':
 *         description: Missing or invalid access token
 *       '404':
 *         description: Not found (or owned by someone else)
 */
export const GET = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const { id } = await params;
  const viewerUserId = optionalAuth(req);
  const business = await getBusinessDetail(viewerUserId, id);
  return ok(business);
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const { userId } = requireAuth(req);
  const { id } = await params;
  const body = validateBody(patchBusinessSchema, await readJsonBody(req));
  const business = await updateBusiness(userId, id, body);
  return ok(business);
});
