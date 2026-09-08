import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAuth } from "@/middleware/auth";
import { getOrCreateQrForDigiPin } from "@/modules/qr/qr.service";
import { ok } from "@/lib/response";

type Params = { params: Promise<{ id: string }> };

/**
 * @swagger
 * /api/digipins/{id}/qr:
  *   get:
  *     summary: Get (or create) the QR for a DigiPin
  *     description: Returns the QR payload — the DigiPin number itself as
  *       plain text, ready to render as a QR image. Any generic scan shows
  *       the code directly. Only the owner of the property can fetch it —
  *       foreign/missing ids give an identical 404. Only available after
  *       admin approval; the owner gets a 403 PROPERTY_NOT_APPROVED
  *       ("not approved yet") while pending.
 *     tags: [QR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         description: DigiPin id
 *     responses:
 *       '200':
 *         description: QR data
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
  *                         qrData: { type: string, example: "WB3150P9VB5Y44XFP6" }
  *                         qrStatus: { type: string, enum: [ACTIVE, DISABLED] }
  *                         token: { type: string, description: 'Lookup key: the number for new QRs, the bare token for legacy URL QRs' }
  *       '401':
  *         description: Missing or invalid access token
  *       '403':
  *         description: Property not approved yet (PROPERTY_NOT_APPROVED)
  *       '404':
  *         description: DigiPin not found (or owned by someone else)
 */
export const GET = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const { userId } = requireAuth(req);
  const { id } = await params;
  const qr = await getOrCreateQrForDigiPin(id, userId);
  return ok(qr);
});
