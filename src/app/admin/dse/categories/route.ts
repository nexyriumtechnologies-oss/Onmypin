import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { ok, created } from "@/lib/response";
import { dseCategoryCreateSchema } from "@/modules/dse/dse.validation";
import { createAdminDseCategory, listAdminDseCategories } from "@/modules/dse/dse.service";


/**
 * @swagger
 * /admin/dse/categories:
 *   get:
 *     summary: List DSE categories (admin view)
 *     description: >-
 *       All non-deleted categories including inactive ones, in sort order.
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     responses:
 *       '200':
 *         description: Category list
 *       '401':
 *         description: Missing or invalid admin token
 *       '403':
 *         description: Admin lacks the content:manage capability
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAdminAuth(req, ["content:manage"]);
  const categories = await listAdminDseCategories();
  return ok({ items: categories, total: categories.length });
});

/**
 * @swagger
 * /admin/dse/categories:
 *   post:
 *     summary: Create DSE category
 *     description: >-
 *       The slug is auto-generated from the name with collision suffixes and
 *       stays stable on later renames. New categories start active.
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, minLength: 1, maxLength: 120 }
 *               description: { type: string, maxLength: 1000 }
 *               icon: { type: string, maxLength: 100 }
 *               imageUrl: { type: string, format: uri }
 *               sortOrder: { type: integer, minimum: 0 }
 *     responses:
 *       '201':
 *         description: Category created
 *       '400':
 *         description: Invalid payload
 *       '401':
 *         description: Missing or invalid admin token
 *       '403':
 *         description: Admin lacks the content:manage capability
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAdminAuth(req, ["content:manage"]);
  const body = validateBody(dseCategoryCreateSchema, await readJsonBody(req));
  const category = await createAdminDseCategory(body);
  return created(category);
});
