import { z } from "zod";
import {
  MAX_RADIUS_KM,
  DEFAULT_RADIUS_KM,
  pageParamSchema,
  pageSizeParamSchema,
} from "@/modules/search/search.validation";

export const businessStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);

const pincodeSchema = z.string().regex(/^\d{6}$/, "Pincode must be 6 digits");
const latitudeSchema = z.number().min(-90).max(90);
const longitudeSchema = z.number().min(-180).max(180);
const contactPhoneSchema = z.string().regex(/^\+?[0-9]{7,15}$/, "Invalid phone number");

export const createBusinessSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    categoryId: z.string().min(1).optional(),
    subcategoryId: z.string().min(1).optional(),
    address: z.string().min(5).max(500).optional(),
    city: z.string().min(2).max(100).optional(),
    state: z.string().min(2).max(100).optional(),
    pincode: pincodeSchema.optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
    contactPhone: contactPhoneSchema.optional(),
    contactEmail: z.string().email().optional(),
  })
  .strict();

export const patchBusinessSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    categoryId: z.string().min(1).optional(),
    subcategoryId: z.string().min(1).optional(),
    address: z.string().min(5).max(500).optional(),
    city: z.string().min(2).max(100).optional(),
    state: z.string().min(2).max(100).optional(),
    pincode: pincodeSchema.optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
    contactPhone: contactPhoneSchema.optional(),
    contactEmail: z.string().email().optional(),
    status: businessStatusSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

/**
 * GET /api/businesses — one route, two views:
 *  - `mine=true` (Bearer): the caller's own businesses, any verification status.
 *  - otherwise: the PUBLIC directory (VERIFIED + ACTIVE only) with filters.
 * `lat`/`lng` switch the public listing to a radius (haversine) filter.
 */
export const businessesListQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(200).optional(),
    categoryId: z.string().min(1).optional(),
    city: z.string().min(1).max(100).optional(),
    state: z.string().min(1).max(100).optional(),
    lat: latitudeSchema.optional(),
    lng: longitudeSchema.optional(),
    radiusKm: z.coerce
      .number()
      .min(0.1)
      .max(MAX_RADIUS_KM)
      .default(DEFAULT_RADIUS_KM),
    mine: z.enum(["true", "false"]).optional(),
    page: pageParamSchema,
    pageSize: pageSizeParamSchema,
  })
  .strict();
