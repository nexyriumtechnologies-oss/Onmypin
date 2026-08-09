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
 *     description: Returns an opaque token the client renders as a QR image.
 *       Only the owner of the property can fetch it — foreign/missing ids give
 *       an identical 404.
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
 *                         qrData: { type: string, example: "https://digipin.app/q/<token>" }
 *                         qrStatus: { type: string, enum: [ACTIVE, DISABLED] }
 *                         token: { type: string }
 *       '401':
 *         description: Missing or invalid access token
 *       '404':
 *         description: DigiPin not found (or owned by someone else)
 */
export const GET = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const { userId } = requireAuth(req);
  const { id } = await params;
  const qr = await getOrCreateQrForDigiPin(id, userId);
  return ok(qr);
});
