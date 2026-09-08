import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { ok } from "@/lib/response";
import { assertDsePublicRateLimit, getPublicDseContentBySlug } from "@/modules/dse/dse.service";

type SlugParams = { params: Promise<{ slug: string }> };


/**
 * @swagger
 * /api/dse/content/{slug}:
 *   get:
 *     summary: Public DSE content detail by slug
 *     description: >-
 *       Full article body, images and source info. Draft, unpublished,
 *       archived and deleted content all return the same 404 (no existence
 *       leak). Rate-limited per IP.
 *     tags: [DSE]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '200':
 *         description: Article detail
 *       '404':
 *         description: Content not found or not published
 *       '429':
 *         description: Rate limit exceeded
 */
export const GET = withErrorHandler(async (req: NextRequest, props: SlugParams) => {
  await assertDsePublicRateLimit(req);
  const { slug } = await props.params;
  return ok(await getPublicDseContentBySlug(slug));
});
