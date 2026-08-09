import { z } from "zod";
import { ApiError } from "@/middleware/errorHandler";

export const propertyTypeSchema = z.enum(["HOUSE", "FLAT", "OTHER"]);
export const ownershipTypeSchema = z.enum(["OWN", "RENT", "OTHER"]);

const pincodeSchema = z.string().regex(/^\d{6}$/, "Pincode must be 6 digits");
const latitudeSchema = z.number().min(-90).max(90);
const longitudeSchema = z.number().min(-180).max(180);

/**
 * Registration-flow schemas (steps 1–10).
 * Create only needs the first steps; later steps are filled via PATCH,
 * and submission requires everything.
 */
export const createPropertySchema = z
  .object({
    ownerName: z.string().min(1).max(120),
    propertyType: propertyTypeSchema,
    ownershipType: ownershipTypeSchema,
    address: z.string().min(5).max(500).optional(),
    city: z.string().min(2).max(100).optional(),
    state: z.string().min(2).max(100).optional(),
    pincode: pincodeSchema.optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
  })
  .strict();

export const patchPropertySchema = z
  .object({
    ownerName: z.string().min(1).max(120).optional(),
    propertyType: propertyTypeSchema.optional(),
    ownershipType: ownershipTypeSchema.optional(),
    address: z.string().min(5).max(500).optional(),
    city: z.string().min(2).max(100).optional(),
    state: z.string().min(2).max(100).optional(),
    pincode: pincodeSchema.optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export interface PropertySubmissionData {
  ownerName: string;
  propertyType: "HOUSE" | "FLAT" | "OTHER";
  ownershipType: "OWN" | "RENT" | "OTHER";
  address: string;
  city: string;
  state: string;
  pincode: string;
  /** Optional device GPS — when absent the server geocodes the address. */
  latitude?: number;
  longitude?: number;
  propertyImages: string[];
  selfieImage: string;
}

/** Full validation gate at submit time. */
export function assertCompleteProperty(input: Record<string, unknown>): PropertySubmissionData {
  const result = z
    .object({
      ownerName: z.string().min(1).max(120),
      propertyType: propertyTypeSchema,
      ownershipType: ownershipTypeSchema,
      address: z.string().min(5).max(500),
      city: z.string().min(2).max(100),
      state: z.string().min(2).max(100),
      pincode: pincodeSchema,
      latitude: latitudeSchema.optional(),
      longitude: longitudeSchema.optional(),
      propertyImages: z.array(z.string().min(1)).min(1, "At least one property image is required"),
      selfieImage: z.string().min(1, "A selfie image is required"),
    })
    .strict()
    .safeParse(input);

  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join("."));
    throw new ApiError(400, "PROPERTY_INCOMPLETE", `Missing/invalid fields: ${missing.join(", ")}`);
  }
  return result.data;
}
