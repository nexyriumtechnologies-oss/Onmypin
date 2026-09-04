import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { assignDistrictSchema } from "@/modules/admin/admin.validation";
import { assignPropertyDistrict } from "@/modules/admin/admin.service";
import { ok } from "@/lib/response";


/**
 * @swagger
 * /admin/properties/{id}/district:
 *   patch:
 *     summary: Assign an LGD district to a property (legacy migration)
 *     description: >-
 *       Sets districtCode/districtName for properties whose DigiPin predates
 *       the v1 format. The code must exist in the LGD dataset; when the stored
 *       state parses, the district must belong to it. Follow with
 *       POST /admin/digipins/{id}/regenerate to recompute the v1 number.
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
 *             required: [districtCode]
 *             properties:
 *               districtCode: { type: 'integer', example: 460, description: LGD district code }
 *     responses:
 *       200:
 *         description: District assigned
 *       400:
 *         description: Unknown district code or district/state mismatch
 *       404:
 *         description: Property not found
 */
export const PATCH = withErrorHandler(async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  await requireAdminAuth(req, ["property:verify"]);
  const { id } = await props.params;
  const body = validateBody(assignDistrictSchema, await readJsonBody(req));
  const updated = await assignPropertyDistrict(id, body.districtCode);
  return ok(updated);
});
