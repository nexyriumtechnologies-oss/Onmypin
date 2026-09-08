import { z } from "zod";
import { pageParamSchema, pageSizeParamSchema } from "@/modules/search/search.validation";

export const dseContentTypeSchema = z.enum([
  "NEWS",
  "GOVERNMENT_UPDATE",
  "PUBLIC_INFORMATION",
  "ANNOUNCEMENT",
  "AWARENESS",
  "EDUCATIONAL_ARTICLE",
]);

export const dseContentStatusSchema = z.enum(["DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"]);

/** Optional URL field: undefined/null/"" all normalize to undefined (stored as NULL). */
const optionalUrlField = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.string().trim().url().max(2048).optional(),
);

/** Optional free-text field that the admin can clear by sending null. */
const clearableTextField = (max: number) =>
  z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().trim().max(max).nullish(),
  );

const dseImageSchema = z.object({
  url: z.string().trim().url().max(2048),
  fileName: z.string().trim().max(255).optional(),
  mimeType: z.string().trim().max(100).optional(),
  fileSize: z.number().int().positive().max(50 * 1024 * 1024).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const dseImagesField = z
  .array(dseImageSchema)
  .max(20)
  .optional()
  .refine(
    (imgs) => !imgs || imgs.every((i) => !i.mimeType || i.mimeType.toLowerCase().startsWith("image/")),
    { message: "dse_media is images-only for MVP (mimeType must start with image/)" },
  );

/** POST /admin/dse/content — status may only start as DRAFT or PUBLISHED. */
export const dseContentCreateSchema = z
  .object({
    title: z.string().trim().min(5).max(200),
    shortDescription: z.string().trim().max(500).optional(),
    description: z.string().trim().min(1),
    contentType: dseContentTypeSchema,
    categoryId: z.string().min(1),
    thumbnailUrl: optionalUrlField,
    coverImageUrl: optionalUrlField,
    externalUrl: optionalUrlField,
    authorName: z.string().trim().max(120).optional(),
    sourceName: z.string().trim().max(200).optional(),
    sourceUrl: optionalUrlField,
    isFeatured: z.boolean().optional(),
    isPinned: z.boolean().optional(),
    status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
    images: dseImagesField,
  })
  .strict();

/**
 * PATCH /admin/dse/content/:id — partial update. `status` is intentionally
 * absent: lifecycle moves only through publish/unpublish/archive endpoints.
 * The slug stays stable when the title changes (published URLs never break).
 */
export const dseContentUpdateSchema = z
  .object({
    title: z.string().trim().min(5).max(200).optional(),
    shortDescription: clearableTextField(500),
    description: z.string().trim().min(1).optional(),
    contentType: dseContentTypeSchema.optional(),
    categoryId: z.string().min(1).optional(),
    thumbnailUrl: optionalUrlField,
    coverImageUrl: optionalUrlField,
    externalUrl: optionalUrlField,
    authorName: clearableTextField(120),
    sourceName: clearableTextField(200),
    sourceUrl: optionalUrlField,
    isFeatured: z.boolean().optional(),
    isPinned: z.boolean().optional(),
    images: dseImagesField,
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field required" });

const isoDateField = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "must be a valid ISO date string" })
  .optional();

const flagField = z.enum(["true", "false"]).optional();

/** GET /admin/dse/content — search + filter across all statuses (soft-deleted excluded). */
export const adminDseContentQuerySchema = z
  .object({
    page: pageParamSchema,
    pageSize: pageSizeParamSchema,
    status: dseContentStatusSchema.optional(),
    contentType: dseContentTypeSchema.optional(),
    categoryId: z.string().optional(),
    isFeatured: flagField,
    isPinned: flagField,
    search: z.string().trim().max(200).optional(),
    fromDate: isoDateField,
    toDate: isoDateField,
    sortBy: z.enum(["createdAt", "updatedAt", "publishedAt", "title"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

/** POST /admin/dse/categories */
export const dseCategoryCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).optional(),
    icon: z.string().trim().max(100).optional(),
    imageUrl: optionalUrlField,
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict();

/** PATCH /admin/dse/categories/:id — partial update, slug stays stable. */
export const dseCategoryUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: clearableTextField(1000),
    icon: clearableTextField(100),
    imageUrl: optionalUrlField,
    sortOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field required" });

/** GET /api/dse/content — public feed. Only PUBLISHED, non-deleted rows served. */
export const publicDseContentQuerySchema = z
  .object({
    page: pageParamSchema,
    pageSize: pageSizeParamSchema,
    search: z.string().trim().min(1).max(200).optional(),
    categoryId: z.string().optional(),
    contentType: dseContentTypeSchema.optional(),
    featured: flagField,
    pinned: flagField,
    sort: z.enum(["latest", "oldest"]).default("latest"),
  })
  .strict();
