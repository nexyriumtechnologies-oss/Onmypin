import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody, ApiError } from "@/middleware/errorHandler";
import { adminLoginSchema } from "@/modules/admin/admin.validation";
import { adminLogin } from "@/modules/admin/admin.auth.service";
import { getRateLimiter, getClientIp } from "@/lib/rateLimit";
import { ok } from "@/lib/response";

const ADMIN_LOGIN_EMAIL_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };
const ADMIN_LOGIN_IP_LIMIT = { limit: 15, windowMs: 15 * 60 * 1000 };


/**
 * @swagger
 * /admin/auth/login:
 *   post:
 *     summary: Admin login
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: 'string' }
 *               password: { type: 'string' }
 *     responses:
 *       200:
 *         description: Success
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = validateBody(adminLoginSchema, await readJsonBody(req));

  const emailKey = `admin:login:email:${body.email.toLowerCase()}`;
  const ipKey = `admin:login:ip:${getClientIp(req.headers)}`;

  const [emailLimit, ipLimit] = await Promise.all([
    getRateLimiter().consume(emailKey, ADMIN_LOGIN_EMAIL_LIMIT),
    getRateLimiter().consume(ipKey, ADMIN_LOGIN_IP_LIMIT),
  ]);

  if (!emailLimit.allowed || !ipLimit.allowed) {
    const retryAfterSeconds = Math.max(emailLimit.retryAfterSeconds ?? 0, ipLimit.retryAfterSeconds ?? 0);
    throw new ApiError(429, "RATE_LIMITED", `Too many login attempts. Try again in ${retryAfterSeconds}s`);
  }


  const result = await adminLogin(body.email, body.password, req);
  return ok(result);
});
