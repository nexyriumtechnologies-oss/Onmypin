import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { propertyVerificationSchema } from "@/modules/admin/admin.validation";
import { verifyAdminProperty } from "@/modules/admin/admin.service";
import { ok } from "@/lib/response";


/**
 * @swagger
 * /admin/properties/{id}/verification:
 *   patch:
 *     summary: Verify or reject property
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
 *               action: { type: 'string', enum: ['APPROVE', 'REJECT'] }
 *               reason: { type: 'string' }
 *     responses:
 *       200:
 *         description: Success
 */
export const PATCH = withErrorHandler(async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  await requireAdminAuth(req, ["property:verify"]);
  const { id } = await props.params;
  const body = validateBody(propertyVerificationSchema, await readJsonBody(req));
  const updated = await verifyAdminProperty(id, body.action, body.reason);
  return ok(updated);
});
