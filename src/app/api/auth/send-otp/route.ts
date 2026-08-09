import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { sendOtpSchema } from "@/modules/auth/auth.validation";
import { sendOtp } from "@/modules/auth/otp.service";
import { getRateLimiter, getClientIp, OTP_IP_RATE_LIMIT } from "@/lib/rateLimit";
import { ApiError } from "@/middleware/errorHandler";
import { ok } from "@/lib/response";

/**
 * @swagger
 * /api/auth/send-otp:
 *   post:
 *     summary: Send a 6-digit OTP to a mobile number
 *     description: Rate limited to 3 sends per mobile per 10 min, plus a coarse
 *       IP-level cap (15/10 min). The OTP is hashed (SHA-256 + OTP_HASH_SALT)
 *       before storage and never stored plain.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mobile]
 *             properties:
 *               mobile:
 *                 type: string
 *                 description: 10-digit Indian mobile starting 6-9
 *                 example: "9876543210"
 *                 pattern: '^[6-9]\d{9}$'
 *               purpose:
 *                 type: string
 *                 enum: [AUTH]
 *                 default: AUTH
 *     responses:
 *       '200':
 *         description: OTP generated and handed to the provider
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
 *                         message: { type: string }
 *                         mobile: { type: string }
 *       '400':
 *         description: Invalid mobile or unknown fields
 *       '429':
 *         description: Rate limited (per-mobile or per-IP)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorEnvelope'
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = validateBody(sendOtpSchema, await readJsonBody(req));

  // Second layer: IP-based cap on top of the per-mobile limit (mobile is
  // primary — see otp.service.ts sendOtp). Same generic 429 as the mobile cap.
  const ipKey = `otp:send:ip:${getClientIp(req.headers)}`;
  const ipLimit = await getRateLimiter().consume(ipKey, OTP_IP_RATE_LIMIT);
  if (!ipLimit.allowed) {
    throw new ApiError(
      429,
      "RATE_LIMITED",
      `Too many OTP requests. Try again in ${ipLimit.retryAfterSeconds}s`,
    );
  }

  await sendOtp(body.mobile, body.purpose);
  return ok({ message: "OTP sent", mobile: body.mobile });
});
