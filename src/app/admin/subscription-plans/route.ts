import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { subscriptionPlanSchema } from "@/modules/admin/admin.validation";
import { createAdminSubscriptionPlan, listAdminSubscriptionPlans } from "@/modules/admin/admin.service";
import { ok, created } from "@/lib/response";


/**
 * @swagger
 * /admin/subscription-plans:
 *   get:
 *     summary: List plans
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Success
 */\nexport const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAdminAuth(req, ["plan:manage"]);
  const plans = await listAdminSubscriptionPlans();
  return ok({ items: plans, total: plans.length });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAdminAuth(req, ["plan:manage"]);
  const body = validateBody(subscriptionPlanSchema, await readJsonBody(req));
  const newPlan = await createAdminSubscriptionPlan(body);
  return created(newPlan);
});
