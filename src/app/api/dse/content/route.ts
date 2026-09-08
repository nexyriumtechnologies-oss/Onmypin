import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { parseQueryParams } from "@/lib/queryParams";
import { ok } from "@/lib/response";
import { publicDseContentQuerySchema } from "@/modules/dse/dse.validation";
import { assertDsePublicRateLimit, listPublicDseContent } from "@/modules/dse/dse.service";


/**
 * @swagger
 * /api/dse/content:
 *   get:
 *     summary: Public DSE content feed
 *     description: >-
 *       Mobile-app feed — ONLY published, non-deleted content with a live
 *       category. Supports search (title, short description, body, category
 *       name), contentType/category filters, featured/pinned flags, and
 *       latest/oldest sorting (latest first by default). Rate-limited per IP.
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
 *       - name: search
 *         in: query
 *         required: false
 *         schema: { type: string, maxLength: 200 }
 *       - name: categoryId
 *         in: query
 *         required: false
 *         schema: { type: string }
 *       - name: contentType
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [NEWS, GOVERNMENT_UPDATE, PUBLIC_INFORMATION, ANNOUNCEMENT, AWARENESS, EDUCATIONAL_ARTICLE] }
 *       - name: featured
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [true, false] }
 *       - name: pinned
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [true, false] }
 *       - name: sort
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [latest, oldest], default: latest }
 *     responses:
 *       '200':
 *         description: Paginated public content cards
 *       '400':
 *         description: Invalid query params
 *       '429':
 *         description: Rate limit exceeded
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await assertDsePublicRateLimit(req);
  const params = parseQueryParams(req, publicDseContentQuerySchema);
  const result = await listPublicDseContent(params);
  return ok(result);
});
