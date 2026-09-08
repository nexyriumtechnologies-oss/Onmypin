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
  *     summary: Verify a scanned QR payload (public, no auth)
  *     description: Resolves the scanned payload server-side and returns only
  *       authorized info — DigiPin number, statuses, city/state. Accepts a raw
  *       DigiPin number (new QRs), a legacy bare token, or a full legacy URL.
  *       Never exact address or personal data. Only works for admin-approved
  *       properties; payloads for unapproved properties give an identical 404.
 *     tags: [QR]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
  *             properties:
  *               token: { type: string, description: 'Scanned payload: raw DigiPin number, legacy bare token, or full legacy URL' }
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
  *                         districtName: { type: string, nullable: true }
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
