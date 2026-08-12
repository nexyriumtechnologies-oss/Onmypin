import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { adminRefreshSchema } from "@/modules/admin/admin.validation";
import { adminRefresh } from "@/modules/admin/admin.auth.service";
import { ok } from "@/lib/response";


/**
 * @swagger
 * /admin/auth/refresh:
 *   post:
 *     summary: Refresh admin tokens
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: 'string' }
 *     responses:
 *       200:
 *         description: Success
 */\nexport const POST = withErrorHandler(async (req: NextRequest) => {
  const body = validateBody(adminRefreshSchema, await readJsonBody(req));
  const result = await adminRefresh(body.refreshToken);
  return ok(result);
});
