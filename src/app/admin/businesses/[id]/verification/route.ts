import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { businessVerificationSchema } from "@/modules/admin/admin.validation";
import { verifyAdminBusiness } from "@/modules/admin/admin.service";
import { ok } from "@/lib/response";


/**
 * @swagger
 * /admin/businesses/{id}/verification:
 *   patch:
 *     summary: Verify or reject business
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: 'string' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               action: { type: 'string', enum: ['APPROVE', 'REJECT', 'SUSPEND'] }
 *               reason: { type: 'string' }
 *     responses:
 *       200:
 *         description: Success
 */
export const PATCH = withErrorHandler(async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  await requireAdminAuth(req, ["business:verify"]);
  const { id } = await props.params;
  const body = validateBody(businessVerificationSchema, await readJsonBody(req));
  const updated = await verifyAdminBusiness(id, body.action, body.reason);
  return ok(updated);
});
