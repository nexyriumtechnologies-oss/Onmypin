import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { verifyOtpSchema } from "@/modules/auth/auth.validation";
import { verifyOtp } from "@/modules/auth/otp.service";
import { ok } from "@/lib/response";

/**
 * @swagger
 * /api/auth/verify-otp:
 *   post:
 *     summary: Verify the OTP and receive tokens
 *     description: Max 3 attempts per OTP (constant-time hash compare). Creates
 *       the user on first login, opens a session, and returns an access token
 *       (15 min) + refresh token (7 days, rotates on every use).
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mobile, otp]
 *             properties:
 *               mobile:
 *                 type: string
 *                 pattern: '^[6-9]\d{9}$'
 *                 example: "9876543210"
 *               otp:
 *                 type: string
 *                 pattern: '^\d{6}$'
 *                 example: "483920"
 *               purpose:
 *                 type: string
 *                 enum: [AUTH]
 *                 default: AUTH
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
  *                           description: Copy this from the actual Server response (the 200 panel below is only an example)
  *                         refreshToken:
  *                           type: string
  *                           example: "refresh-token-example-do-not-use"
  *                         userId:
  *                           type: string
  *                           example: "user-id-example"
  *                         isNewUser: { type: boolean }
 *       '400':
 *         description: Invalid OTP, expired, attempts exhausted, or bad payload
 *       '403':
 *         description: Account deactivated/deleted
 *       '429':
 *         description: Rate limited
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = validateBody(verifyOtpSchema, await readJsonBody(req));
  const { accessToken, refreshToken, userId, isNewUser } = await verifyOtp(
    body.mobile,
    body.otp,
    body.purpose,
    body.deviceInfo,
  );
  return ok({ accessToken, refreshToken, userId, isNewUser });
});
