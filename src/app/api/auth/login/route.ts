import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { loginSchema } from "@/modules/auth/auth.validation";
import { loginWithPassword } from "@/modules/auth/login.service";
import { ok } from "@/lib/response";

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login with mobile and password
 *     description: >-
 *       Authenticates a registered user using their mobile number and password.
 *       Returns an access token (15 min) and a rotating refresh token (7 days).
 *       All failure paths return the same generic 401 to prevent mobile-existence leaks.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mobile, password]
 *             properties:
 *               mobile:
 *                 type: string
 *                 pattern: '^[6-9]\d{9}$'
 *                 example: "9876543210"
 *               password:
 *                 type: string
 *                 example: "SecurePass1"
 *               deviceInfo:
 *                 type: string
 *                 maxLength: 255
 *     responses:
 *       '200':
 *         description: Tokens issued
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         accessToken:
 *                           type: string
 *                           example: "PASTE-THIS-REAL-TOKEN-INTO-AUTHORIZE"
 *                         refreshToken: { type: string }
 *                         userId: { type: string }
 *                         isNewUser: { type: boolean, example: false }
 *       '401':
 *         description: Mobile or password is incorrect (INVALID_CREDENTIALS)
 *       '403':
 *         description: Account deactivated or deleted (ACCOUNT_DISABLED)
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = validateBody(loginSchema, await readJsonBody(req));
  const result = await loginWithPassword(body.mobile, body.password, body.deviceInfo);
  return ok(result);
});
