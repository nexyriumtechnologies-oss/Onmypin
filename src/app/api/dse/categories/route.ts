import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { ok } from "@/lib/response";
import { assertDsePublicRateLimit, listPublicDseCategories } from "@/modules/dse/dse.service";


/**
 * @swagger
 * /api/dse/categories:
 *   get:
 *     summary: Public DSE categories
 *     description: Active, non-deleted categories in sort order. Rate-limited per IP.
 *     tags: [DSE]
 *     responses:
 *       '200':
 *         description: Category list
 *       '429':
 *         description: Rate limit exceeded
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await assertDsePublicRateLimit(req);
  return ok(await listPublicDseCategories());
});
