import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { z } from "zod";
import { verifyLocation } from "@/modules/location/location.service";
import { ok } from "@/lib/response";

const verifyLocationSchema = z
  .object({
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    address: z.string().min(5).max(500),
  })
  .strict();

/**
 * @swagger
 * /api/location/verify:
 *   post:
 *     summary: Verify an address (geocodes it; cross-checks device GPS if sent)
 *     description: >-
 *       The typed address is always geocoded server-side (no manual coordinates
 *       needed). If the client also sends device GPS (`latitude`/`longitude`),
 *       both are cross-checked: `verified` is true when the GPS point is within
 *       500m of the geocoded address. Provider is `osm` (OpenStreetMap
 *       Nominatim) or `mock` per LOCATION_PROVIDER.
 *     tags: [Location]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [address]
 *             properties:
 *               latitude: { type: number, minimum: -90, maximum: 90, description: Optional device GPS latitude }
 *               longitude: { type: number, minimum: -180, maximum: 180, description: Optional device GPS longitude }
 *               address: { type: string, minLength: 5, maxLength: 500 }
 *     responses:
 *       '200':
 *         description: Geocoding + (optional) GPS cross-check result
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
 *                         latitude: { type: number }
 *                         longitude: { type: number }
 *                         formattedAddress: { type: string }
 *                         verified: { type: boolean }
 *                         source: { type: string, enum: [osm, mock] }
 *                         gps:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             latitude: { type: number }
 *                             longitude: { type: number }
 *                         distanceMeters: { type: number, nullable: true }
 *       '400':
 *         description: Invalid payload
 *       '502':
 *         description: Geocoder failure (no match or upstream error)
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = validateBody(verifyLocationSchema, await readJsonBody(req));
  const result = await verifyLocation(body);
  return ok(result);
});
