import { z } from "zod";

export const searchTypeSchema = z.enum(["digipin", "address", "business", "all"]);

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_RADIUS_KM = 5;
export const MAX_RADIUS_KM = 100;

export const pageParamSchema = z.coerce.number().int().min(1).default(1);
export const pageSizeParamSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_PAGE_SIZE)
  .default(DEFAULT_PAGE_SIZE);

/** Shared page/pageSize query params (validated from the URL query string). */
export const paginationParamsSchema = z
  .object({
    page: pageParamSchema,
    pageSize: pageSizeParamSchema,
  })
  .strict();

/** GET /api/search — unified search across DigiPin number, address, business name. */
export const searchParamsSchema = z
  .object({
    q: z.string().trim().min(1).max(200),
    type: searchTypeSchema.default("all"),
    page: pageParamSchema,
    pageSize: pageSizeParamSchema,
  })
  .strict();

/** GET /api/locations/nearby — radius search over stored coordinates. */
export const nearbyParamsSchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    radiusKm: z.coerce
      .number()
      .min(0.1)
      .max(MAX_RADIUS_KM)
      .default(DEFAULT_RADIUS_KM),
    type: z.enum(["property", "business", "all"]).default("all"),
    page: pageParamSchema,
    pageSize: pageSizeParamSchema,
  })
  .strict();

/** GET /api/search/nearby — same as locations/nearby but always combines both. */
export const searchNearbyParamsSchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    radiusKm: z.coerce
      .number()
      .min(0.1)
      .max(MAX_RADIUS_KM)
      .default(DEFAULT_RADIUS_KM),
    page: pageParamSchema,
    pageSize: pageSizeParamSchema,
  })
  .strict();

/** POST /api/search/history — record a search term against the current user. */
export const recordSearchSchema = z
  .object({
    query: z.string().trim().min(1).max(200),
    type: searchTypeSchema.default("all"),
  })
  .strict();
