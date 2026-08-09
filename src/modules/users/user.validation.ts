import { z } from "zod";
import { mobileSchema } from "@/modules/auth/auth.validation";

export const updateMeSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    email: z.string().email().nullable().optional(),
    // Previously-uploaded MediaFile id (from POST /api/media/profile-image) — not raw file data.
    profileImage: z.string().min(1).max(100).optional(),
    language: z.string().min(2).max(10).optional(),
    accountStatus: z.enum(["ACTIVE", "DEACTIVATED"]).optional(),
  })
  .strict();

export const deleteMeSchema = z.object({});

export { mobileSchema };
