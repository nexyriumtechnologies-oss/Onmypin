import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { ok } from "@/lib/response";
import { parseQueryParams } from "@/lib/queryParams";
import { searchParamsSchema } from "@/modules/search/search.validation";
import { searchAll } from "@/modules/search/search.service";

/**
 * @swagger
 * /api/search:
 *   get:
 *     summary: Unified search across DigiPin number, address, and business name
 *     description: >-
 *       Text (case-insensitive contains) over stored fields. `type` filters the
 *       surface: digipin | address | business | all. Privacy-safe projections —
 *       DigiPin number + city/state for properties, name/category/city/state for
 *       businesses (verified only); never full address, owner name, or media.
 *     tags: [Search]
 *     parameters:
 *       - name: q
 *         in: query
 *         required: true
 *         schema: { type: string, minLength: 1, maxLength: 200 }
 *       - name: type
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [digipin, address, business, all], default: all }
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
 *         description: Search results
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
 *                         items: { type: array }
 *                         total: { type: integer }
 *                         page: { type: integer }
 *                         pageSize: { type: integer }
 *       '400':
 *         description: Missing q or invalid params
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const params = parseQueryParams(req, searchParamsSchema);
  const result = await searchAll(params);
  return ok(result);
});
