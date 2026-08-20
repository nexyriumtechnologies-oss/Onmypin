import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { registerInitSchema } from "@/modules/auth/auth.validation";
import { initiateRegister } from "@/modules/auth/register.service";
import { ok } from "@/lib/response";

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Initiate registration — sends OTP to mobile
 *     description: >-
 *       Validates name/email/mobile/password, stores a pending registration,
 *       and fires a real SMS OTP to the supplied mobile number. Follow up with
 *       POST /api/auth/register/verify to complete account creation.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, mobile, password]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Anuraj Kumar"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "anuraj@example.com"
 *               mobile:
 *                 type: string
 *                 pattern: '^[6-9]\d{9}$'
 *                 example: "9876543210"
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 description: "Min 8 chars, at least 1 uppercase letter, 1 digit"
 *                 example: "SecurePass1"
 *     responses:
 *       '200':
 *         description: OTP sent to mobile — proceed to /api/auth/register/verify
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
 *                         message: { type: string, example: "OTP sent to your mobile number" }
 *                         mobile: { type: string }
 *       '400':
 *         description: Validation error (invalid email / weak password / bad mobile)
 *       '409':
 *         description: Mobile already registered (MOBILE_TAKEN)
 *       '429':
 *         description: Rate limited
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = validateBody(registerInitSchema, await readJsonBody(req));
  await initiateRegister(body.name, body.email, body.mobile, body.password);
  return ok({ message: "OTP sent to your mobile number. Use POST /api/auth/register/verify to complete registration.", mobile: body.mobile });
});
