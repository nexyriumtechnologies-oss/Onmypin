import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { regenerateDigiPin } from "@/modules/admin/admin.service";
import { ok } from "@/lib/response";


/**
 * @swagger
 * /admin/digipins/{id}/regenerate:
 *   post:
 *     summary: Recompute the v1 DigiPin number in place (legacy migration)
 *     description: >-
 *       Encodes state + district + coordinates into the v1 format and replaces
 *       digipinNumber on the existing row — the digipinId is unchanged, so
 *       already-printed QRs keep scanning. Requires a district on the property
 *       (PATCH /admin/properties/{id}/district first) plus stored state and
 *       coordinates. Status is untouched.
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: 'string', description: DigiPin row id }
 *     responses:
 *       200:
 *         description: DigiPin regenerated
 *       400:
 *         description: Missing district/state/coordinates on the property
 *       404:
 *         description: DigiPin not found
 */
export const POST = withErrorHandler(async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  await requireAdminAuth(req, ["digipin:status"]);
  const { id } = await props.params;
  const updated = await regenerateDigiPin(id);
  return ok(updated);
});
