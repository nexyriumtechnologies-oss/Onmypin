import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { subscriptionPlanUpdateSchema } from "@/modules/admin/admin.validation";
import { updateAdminSubscriptionPlan } from "@/modules/admin/admin.service";
import { ok } from "@/lib/response";


/**
 * @swagger
 * /admin/subscription-plans/{id}:
 *   patch:
 *     summary: Update plan
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
 *               isActive: { type: 'boolean' }
 *     responses:
 *       200:
 *         description: Updated
 */\nexport const PATCH = withErrorHandler(async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  await requireAdminAuth(req, ["plan:manage"]);
  const { id } = await props.params;
  const body = validateBody(subscriptionPlanUpdateSchema, await readJsonBody(req));
  const updated = await updateAdminSubscriptionPlan(id, body);
  return ok(updated);
});
