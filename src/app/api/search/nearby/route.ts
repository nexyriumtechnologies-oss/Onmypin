import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { ok } from "@/lib/response";
import { parseQueryParams } from "@/lib/queryParams";
import { searchNearbyParamsSchema } from "@/modules/search/search.validation";
import { searchNearby } from "@/modules/search/search.service";

/**
 * @swagger
 * /api/search/nearby:
 *   get:
 *     summary: Nearby search combining properties + businesses
 *     description: >-
 *       Combines submitted properties and VERIFIED businesses within the radius,
 *       sorted by distance, paginated. Stored-coordinate haversine — no geocoder
 *       call at query time.
 *     tags: [Search]
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
 *         description: Nearby combined results
 *       '400':
 *         description: Invalid or missing query params
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const params = parseQueryParams(req, searchNearbyParamsSchema);
  const result = await searchNearby({ ...params, type: "all" });
  return ok(result);
});
