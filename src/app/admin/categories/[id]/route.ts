import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { updateAdminCategory } from "@/modules/admin/admin.service";
import { ok } from "@/lib/response";
import { z } from "zod";

const categoryUpdateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    order: z.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field required" });


/**
 * @swagger
 * /admin/categories/{id}:
 *   patch:
 *     summary: Update category
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: 'string' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: 'string' }
 *               order: { type: 'integer' }
 *               isActive: { type: 'boolean' }
 *     responses:
 *       200:
 *         description: Updated
 */
export const PATCH = withErrorHandler(async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  await requireAdminAuth(req, ["category:manage"]);
  const { id } = await props.params;
  const body = validateBody(categoryUpdateSchema, await readJsonBody(req));
  const updated = await updateAdminCategory(id, body);
  return ok(updated);
});
