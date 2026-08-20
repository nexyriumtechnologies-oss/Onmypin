import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { registerVerifySchema } from "@/modules/auth/auth.validation";
import { completeRegister } from "@/modules/auth/register.service";
import { ok } from "@/lib/response";

/**
 * @swagger
 * /api/auth/register/verify:
 *   post:
 *     summary: Complete registration by verifying the OTP
 *     description: >-
 *       Verifies the 6-digit OTP sent to the mobile during POST /api/auth/register.
 *       On success, creates the user account and issues an access + refresh token pair.
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
 *               deviceInfo:
 *                 type: string
 *                 maxLength: 255
 *     responses:
 *       '200':
 *         description: Account created — tokens issued
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
 *                         accessToken: { type: string }
 *                         refreshToken: { type: string }
 *                         userId: { type: string }
 *                         isNewUser: { type: boolean, example: true }
 *       '400':
 *         description: Invalid OTP / expired OTP / registration session expired
 *       '409':
 *         description: Email or mobile taken by another account (race condition)
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = validateBody(registerVerifySchema, await readJsonBody(req));
  const result = await completeRegister(body.mobile, body.otp, body.deviceInfo);
  return ok(result);
});
