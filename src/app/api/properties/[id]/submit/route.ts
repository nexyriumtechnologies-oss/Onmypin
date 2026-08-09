import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAuth } from "@/middleware/auth";
import { submitProperty } from "@/modules/properties/property.service";
import { assertCompleteProperty } from "@/modules/properties/property.validation";
import { ok } from "@/lib/response";

type Params = { params: Promise<{ id: string }> };

/**
 * @swagger
 * /api/properties/{id}/submit:
 *   post:
 *     summary: Submit a property for verification
 *     description: >-
 *       Full completeness gate (400 PROPERTY_INCOMPLETE otherwise). All steps
 *       plus `propertyImages` (at least one fileId from
 *       POST /api/media/property-images — pool holds up to 3) and `selfieImage`
 *       (one fileId from POST /api/media/selfie) are required. Media files
 *       must belong to the caller. `latitude`/`longitude` are OPTIONAL device
 *       GPS — when absent the server geocodes the full address automatically
 *       (LOCATION_PROVIDER=osm/mock); users never type coordinates. On success
 *       the DigiPin is generated and a QR is created inside a transaction.
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ownerName
 *               - propertyType
 *               - ownershipType
 *               - address
 *               - city
 *               - state
 *               - pincode
 *               - propertyImages
 *               - selfieImage
 *             properties:
 *               ownerName: { type: string, minLength: 1, maxLength: 120 }
 *               propertyType: { type: string, enum: [HOUSE, FLAT, OTHER] }
 *               ownershipType: { type: string, enum: [OWN, RENT, OTHER] }
 *               address: { type: string, minLength: 5, maxLength: 500 }
 *               city: { type: string, minLength: 2, maxLength: 100 }
 *               state: { type: string, minLength: 2, maxLength: 100 }
 *               pincode: { type: string, pattern: '^\d{6}$' }
 *               latitude: { type: number, minimum: -90, maximum: 90, description: Optional device GPS latitude; server geocodes the address when absent }
 *               longitude: { type: number, minimum: -180, maximum: 180, description: Optional device GPS longitude; server geocodes the address when absent }
 *               propertyImages:
 *                 type: array
 *                 minItems: 1
 *                 items: { type: string, description: MediaFile id (PROPERTY_IMAGE) }
 *               selfieImage:
 *                 type: string
 *                 description: MediaFile id (SELFIE)
 *     responses:
 *       '200':
 *         description: Submitted — DigiPin generated
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
 *                         property:
 *                           type: object
 *                           properties:
 *                             id: { type: string }
 *                             verificationStatus: { type: string, enum: [SUBMITTED] }
 *                         digipinNumber: { type: string, example: WB472801 }
 *       '400':
 *         description: Incomplete property, invalid media, or bad transition
 *       '401':
 *         description: Missing or invalid access token
 *       '404':
 *         description: Property not found
 *       '502':
 *         description: Location geocoding failed (no GPS sent and the address could not be resolved)
 */
export const POST = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const { userId } = requireAuth(req);
  const { id } = await params;
  const body = assertCompleteProperty(await req.json().catch(() => ({})));
  const result = await submitProperty(userId, id, body);
  return ok(result);
});
