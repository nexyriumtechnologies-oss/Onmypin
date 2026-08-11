import { withErrorHandler } from "@/middleware/errorHandler";
import { ok } from "@/lib/response";
import { listActiveCategories } from "@/modules/business/business.service";

/**
 * @swagger
 * /api/categories:
 *   get:
 *     summary: Active business categories (form builder)
 *     description: >-
 *       Top-level active categories, each with its active subcategories,
 *       ordered by the configured `order`. Used to build the category dropdowns
 *       on the business form. PUBLIC — no auth.
 *     tags: [Business]
 *     responses:
 *       '200':
 *         description: Category tree
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       name: { type: string }
 *                       order: { type: integer }
 *                       subcategories:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id: { type: string }
 *                             name: { type: string }
 *                             order: { type: integer }
 */
export const GET = withErrorHandler(async () => {
  const categories = await listActiveCategories();
  return ok(categories);
});
