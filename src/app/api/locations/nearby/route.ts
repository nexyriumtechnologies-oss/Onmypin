import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { ok } from "@/lib/response";
import { parseQueryParams } from "@/lib/queryParams";
import { nearbyParamsSchema } from "@/modules/search/search.validation";
import { searchNearby } from "@/modules/search/search.service";

/**
 * @swagger
 * /api/locations/nearby:
 *   get:
 *     summary: Nearby properties and/or businesses within a radius
 *     description: >-
 *       Radius search over STORED coordinates (haversine) — no geocoder call at
 *       query time. Returns submitted properties (DigiPin public projection) and
 *       VERIFIED businesses, sorted by distance, paginated. Privacy-safe: never
 *       the full address, owner name, or media.
 *     tags: [Location]
 *     parameters:
 *       - name: lat
 *         in: query
 *         required: true
 *         schema: { type: number, minimum: -90, maximum: 90 }
 *       - name: lng
 *         in: query
 *         required: true
 *         schema: { type: number, minimum: -180, maximum: 180 }
 *       - name: radiusKm
 *         in: query
 *         required: false
 *         schema: { type: number, minimum: 0.1, maximum: 100, default: 5 }
 *       - name: type
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [property, business, all], default: all }
 *       - name: page
 *         in: query
 *         required: false
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - name: pageSize
 *         in: query
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       '200':
 *         description: Nearby results
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
 *                         items:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               kind: { type: string, enum: [property, business] }
 *                               distanceMeters: { type: integer }
 *                         total: { type: integer }
 *                         page: { type: integer }
 *                         pageSize: { type: integer }
 *       '400':
 *         description: Invalid or missing query params
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const params = parseQueryParams(req, nearbyParamsSchema);
  const result = await searchNearby(params);
  return ok(result);
});
