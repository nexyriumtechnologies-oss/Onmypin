import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { parseQueryParams } from "@/lib/queryParams";
import { pageParamSchema, pageSizeParamSchema } from "@/modules/search/search.validation";
import { ok } from "@/lib/response";
import { z } from "zod";
import { assertDsePublicRateLimit, listPublicFeaturedDseContent } from "@/modules/dse/dse.service";

const featuredQuerySchema = z
  .object({ page: pageParamSchema, pageSize: pageSizeParamSchema })
  .strict();


/**
 * @swagger
 * /api/dse/featured:
 *   get:
 *     summary: Public featured DSE content
 *     description: >-
 *       Published + featured cards, newest first. Rate-limited per IP.
 *     tags: [DSE]
 *     parameters:
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
 *         description: Paginated featured cards
 *       '400':
 *         description: Invalid query params
 *       '429':
 *         description: Rate limit exceeded
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await assertDsePublicRateLimit(req);
  const params = parseQueryParams(req, featuredQuerySchema);
  return ok(await listPublicFeaturedDseContent(params.page, params.pageSize));
});
