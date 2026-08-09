import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody, ApiError } from "@/middleware/errorHandler";
import { z } from "zod";
import { getGeocoder } from "@/modules/location/location.provider";
import { ok } from "@/lib/response";

const reverseSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict();

/**
 * @swagger
 * /api/location/reverse:
 *   post:
 *     summary: Reverse-geocode a GPS point to a place name
 *     description: >-
 *       Turns device GPS coordinates into a readable address (used to auto-fill
 *       the address field on the client). Returns 502 GEOCODE_FAILED when the
 *       provider cannot resolve the point.
 *     tags: [Location]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude]
 *             properties:
 *               latitude: { type: number, minimum: -90, maximum: 90 }
 *               longitude: { type: number, minimum: -180, maximum: 180 }
 *     responses:
 *       '200':
 *         description: Place name for the coordinates
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
 *                         formattedAddress: { type: string }
 *                         source: { type: string, enum: [osm, mock] }
 *       '400':
 *         description: Invalid payload
 *       '502':
 *         description: Reverse geocoding failed
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = validateBody(reverseSchema, await readJsonBody(req));
  try {
    const name = await getGeocoder().reverseGeocode(body.latitude, body.longitude);
    if (!name) {
      throw new ApiError(502, "GEOCODE_FAILED", "Could not resolve those coordinates to a place");
    }
    return ok({ formattedAddress: name, source: "osm" });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(502, "GEOCODE_FAILED", "Could not resolve those coordinates to a place");
  }
});
