import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { createAdminCategory, listAdminCategories } from "@/modules/admin/admin.service";
import { ok, created } from "@/lib/response";
import { z } from "zod";

const categoryCreateSchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().optional(),
  order: z.number().int().optional(),
});


/**
 * @swagger
 * /admin/categories:
 *   get:
 *     summary: List categories
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     responses:
 *       200:
 *         description: List of categories
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAdminAuth(req, ["category:manage"]);
  const categories = await listAdminCategories();
  return ok({ items: categories, total: categories.length });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAdminAuth(req, ["category:manage"]);
  const body = validateBody(categoryCreateSchema, await readJsonBody(req));
  const newCat = await createAdminCategory(body);
  return created(newCat);
});
