import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { ok } from "@/lib/response";
import { dseCategoryUpdateSchema } from "@/modules/dse/dse.validation";
import {
  deleteAdminDseCategory,
  getAdminDseCategory,
  updateAdminDseCategory,
} from "@/modules/dse/dse.service";

type IdParams = { params: Promise<{ id: string }> };


/**
 * @swagger
 * /admin/dse/categories/{id}:
 *   get:
 *     summary: Get single DSE category
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '200':
 *         description: Category detail
 *       '401':
 *         description: Missing or invalid admin token
 *       '403':
 *         description: Admin lacks the content:manage capability
 *       '404':
 *         description: Category not found
 */
export const GET = withErrorHandler(async (req: NextRequest, props: IdParams) => {
  await requireAdminAuth(req, ["content:manage"]);
  const { id } = await props.params;
  return ok(await getAdminDseCategory(id));
});

/**
 * @swagger
 * /admin/dse/categories/{id}:
 *   patch:
 *     summary: Update DSE category
 *     description: Partial update — renames keep the existing slug.
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, minLength: 1, maxLength: 120 }
 *               description: { type: string, maxLength: 1000, nullable: true }
 *               icon: { type: string, maxLength: 100, nullable: true }
 *               imageUrl: { type: string, format: uri, nullable: true }
 *               sortOrder: { type: integer, minimum: 0 }
 *               isActive: { type: boolean }
 *     responses:
 *       '200':
 *         description: Updated category
 *       '400':
 *         description: Invalid payload
 *       '401':
 *         description: Missing or invalid admin token
 *       '403':
 *         description: Admin lacks the content:manage capability
 *       '404':
 *         description: Category not found
 */
export const PATCH = withErrorHandler(async (req: NextRequest, props: IdParams) => {
  await requireAdminAuth(req, ["content:manage"]);
  const { id } = await props.params;
  const body = validateBody(dseCategoryUpdateSchema, await readJsonBody(req));
  return ok(await updateAdminDseCategory(id, body));
});

/**
 * @swagger
 * /admin/dse/categories/{id}:
 *   delete:
 *     summary: Soft-delete DSE category
 *     description: >-
 *       Blocked with DSE_CATEGORY_IN_USE while any live content references
 *       the category — move or delete that content first.
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '200':
 *         description: Deletion marker
 *       '400':
 *         description: Category still referenced by live content
 *       '401':
 *         description: Missing or invalid admin token
 *       '403':
 *         description: Admin lacks the content:manage capability
 *       '404':
 *         description: Category not found
 */
export const DELETE = withErrorHandler(async (req: NextRequest, props: IdParams) => {
  await requireAdminAuth(req, ["content:manage"]);
  const { id } = await props.params;
  return ok(await deleteAdminDseCategory(id));
});
