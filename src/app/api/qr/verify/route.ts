import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { verifyQrToken } from "@/modules/qr/qr.service";
import { z } from "zod";
import { ok } from "@/lib/response";

const verifyQrSchema = z
  .object({
    token: z.string().min(1, "token is required"),
  })
  .strict();

/**
 * @swagger
 * /api/qr/verify:
 *   post:
 *     summary: Verify a QR token (public, no auth)
 *     description: Resolves the opaque QR token server-side and returns only
 *       authorized info — DigiPin number, statuses, city/state. Never exact
 *       address or personal data.
 *     tags: [QR]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string }
 *     responses:
 *       '200':
 *         description: Verified
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
 *                         digipinNumber: { type: string }
 *                         status: { type: string, enum: [ACTIVE, INACTIVE] }
 *                         verificationStatus: { type: string }
 *                         city: { type: string, nullable: true }
 *                         state: { type: string, nullable: true }
 *       '400':
 *         description: Invalid payload
 *       '404':
 *         description: QR code is invalid or disabled
 *       '410':
 *         description: DigiPin is not active
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = validateBody(verifyQrSchema, await readJsonBody(req));
  const result = await verifyQrToken(body.token);
  return ok(result);
});
