import { z } from "zod";
import type { NextRequest } from "next/server";
import {
  Prisma,
  type DseAuditAction,
  type DseContentStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/middleware/errorHandler";
import { DSE_PUBLIC_RATE_LIMIT, getClientIp, getRateLimiter } from "@/lib/rateLimit";
import {
  adminDseContentQuerySchema,
  dseCategoryCreateSchema,
  dseCategoryUpdateSchema,
  dseContentCreateSchema,
  dseContentUpdateSchema,
  publicDseContentQuerySchema,
} from "@/modules/dse/dse.validation";
import { slugifyTitle } from "@/modules/dse/slug";
import { sanitizeDseHtml } from "@/modules/dse/html";

type DseContentCreateInput = z.output<typeof dseContentCreateSchema>;
type DseContentUpdateInput = z.output<typeof dseContentUpdateSchema>;
type AdminDseContentQuery = z.output<typeof adminDseContentQuerySchema>;
type PublicDseContentQuery = z.output<typeof publicDseContentQuerySchema>;
type DseCategoryCreateInput = z.output<typeof dseCategoryCreateSchema>;
type DseCategoryUpdateInput = z.output<typeof dseCategoryUpdateSchema>;

// ---------------------------------------------------------------- helpers

/** Live (non-deleted) category, or 404. Inactive categories reject new/updated content. */
async function requireLiveCategory(categoryId: string) {
  const category = await prisma.dseCategory.findUnique({ where: { id: categoryId } });
  if (!category || category.deletedAt) {
    throw new ApiError(404, "DSE_CATEGORY_NOT_FOUND", "DSE category not found");
  }
  if (!category.isActive) {
    throw new ApiError(400, "DSE_CATEGORY_INACTIVE", "DSE category is inactive");
  }
  return category;
}

/** Live (non-deleted) content row, or 404 — same error for missing/deleted (no leak). */
async function requireLiveContent(id: string, include?: Prisma.DseContentInclude) {
  const content = await prisma.dseContent.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      media: { orderBy: { sortOrder: "asc" } },
      ...include,
    },
  });
  if (!content || content.deletedAt) {
    throw new ApiError(404, "DSE_CONTENT_NOT_FOUND", "DSE content not found");
  }
  return content;
}

async function uniqueContentSlug(base: string): Promise<string> {
  let slug = base;
  for (let n = 2; ; n++) {
    const existing = await prisma.dseContent.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) return slug;
    slug = `${base}-${n}`;
  }
}

async function uniqueCategorySlug(base: string): Promise<string> {
  let slug = base;
  for (let n = 2; ; n++) {
    const existing = await prisma.dseCategory.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) return slug;
    slug = `${base}-${n}`;
  }
}

/** Sanitize + reject bodies that sanitize down to nothing. */
function cleanDescription(description: string): string {
  const clean = sanitizeDseHtml(description);
  if (clean.replace(/<[^>]*>/g, "").trim() === "") {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid request payload: description has no readable content");
  }
  return clean;
}

async function logDseAudit(
  contentId: string,
  adminId: string,
  action: DseAuditAction,
  oldStatus: string | null,
  newStatus: string | null,
) {
  await prisma.dseAuditLog.create({
    data: { contentId, adminId, action, oldStatus, newStatus },
  });
}

function mediaCreate(
  images: NonNullable<DseContentCreateInput["images"]>,
): Prisma.DseMediaCreateWithoutContentInput[] {
  return images.map((img, i) => ({
    mediaType: "IMAGE" as const,
    url: img.url,
    fileName: img.fileName ?? null,
    mimeType: img.mimeType ?? null,
    fileSize: img.fileSize ?? null,
    sortOrder: img.sortOrder ?? i,
  }));
}

// ---------------------------------------------------------------- admin: content CRUD

export async function createAdminDseContent(adminId: string, input: DseContentCreateInput) {
  await requireLiveCategory(input.categoryId);
  const slug = await uniqueContentSlug(slugifyTitle(input.title));
  const description = cleanDescription(input.description);
  const publishNow = input.status === "PUBLISHED";

  const content = await prisma.dseContent.create({
    data: {
      title: input.title,
      slug,
      shortDescription: input.shortDescription ?? null,
      description,
      contentType: input.contentType,
      categoryId: input.categoryId,
      thumbnailUrl: input.thumbnailUrl ?? null,
      coverImageUrl: input.coverImageUrl ?? null,
      externalUrl: input.externalUrl ?? null,
      authorName: input.authorName ?? null,
      sourceName: input.sourceName ?? null,
      sourceUrl: input.sourceUrl ?? null,
      status: input.status,
      isFeatured: input.isFeatured ?? false,
      isPinned: input.isPinned ?? false,
      publishedAt: publishNow ? new Date() : null,
      createdBy: adminId,
      updatedBy: adminId,
      ...(input.images?.length ? { media: { create: mediaCreate(input.images) } } : {}),
    },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      media: { orderBy: { sortOrder: "asc" } },
    },
  });

  await logDseAudit(content.id, adminId, "CREATED", null, content.status);
  return content;
}

export async function getAdminDseContent(id: string) {
  return requireLiveContent(id);
}

export async function listAdminDseContent(query: AdminDseContentQuery) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;

  const where: Prisma.DseContentWhereInput = { deletedAt: null };
  if (query.status) where.status = query.status as DseContentStatus;
  if (query.contentType) where.contentType = query.contentType;
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.isFeatured !== undefined) where.isFeatured = query.isFeatured === "true";
  if (query.isPinned !== undefined) where.isPinned = query.isPinned === "true";
  if (query.search) {
    where.OR = [
      { title: { contains: query.search } },
      { shortDescription: { contains: query.search } },
      { description: { contains: query.search } },
      { category: { name: { contains: query.search } } },
    ];
  }
  if (query.fromDate || query.toDate) {
    where.createdAt = {
      ...(query.fromDate && { gte: new Date(query.fromDate) }),
      ...(query.toDate && { lte: new Date(query.toDate) }),
    };
  }

  const [contents, total] = await Promise.all([
    prisma.dseContent.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [query.sortBy ?? "createdAt"]: query.sortOrder ?? "desc" },
      include: { category: { select: { id: true, name: true, slug: true } } },
    }),
    prisma.dseContent.count({ where }),
  ]);

  return { contents, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function updateAdminDseContent(id: string, adminId: string, input: DseContentUpdateInput) {
  const existing = await requireLiveContent(id);
  if (input.categoryId) await requireLiveCategory(input.categoryId);

  const updated = await prisma.dseContent.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.shortDescription !== undefined && { shortDescription: input.shortDescription }),
      ...(input.description !== undefined && { description: cleanDescription(input.description) }),
      ...(input.contentType !== undefined && { contentType: input.contentType }),
      ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
      ...(input.thumbnailUrl !== undefined && { thumbnailUrl: input.thumbnailUrl ?? null }),
      ...(input.coverImageUrl !== undefined && { coverImageUrl: input.coverImageUrl ?? null }),
      ...(input.externalUrl !== undefined && { externalUrl: input.externalUrl ?? null }),
      ...(input.authorName !== undefined && { authorName: input.authorName }),
      ...(input.sourceName !== undefined && { sourceName: input.sourceName }),
      ...(input.sourceUrl !== undefined && { sourceUrl: input.sourceUrl ?? null }),
      ...(input.isFeatured !== undefined && { isFeatured: input.isFeatured }),
      ...(input.isPinned !== undefined && { isPinned: input.isPinned }),
      ...(input.images !== undefined && {
        media: { deleteMany: {}, create: mediaCreate(input.images) },
      }),
      updatedBy: adminId,
    },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      media: { orderBy: { sortOrder: "asc" } },
    },
  });

  await logDseAudit(id, adminId, "UPDATED", existing.status, updated.status);
  return updated;
}

/** Soft delete — the row is retained, public/admin listings exclude it. */
export async function deleteAdminDseContent(id: string, adminId: string) {
  const existing = await requireLiveContent(id);
  await prisma.dseContent.update({
    where: { id },
    data: { deletedAt: new Date(), updatedBy: adminId },
  });
  await logDseAudit(id, adminId, "DELETED", existing.status, null);
  return { id, deleted: true };
}

// ---------------------------------------------------------------- admin: lifecycle

export async function publishAdminDseContent(id: string, adminId: string) {
  const existing = await requireLiveContent(id);
  if (existing.status === "PUBLISHED") {
    throw new ApiError(400, "DSE_ALREADY_PUBLISHED", "DSE content is already published");
  }
  const updated = await prisma.dseContent.update({
    where: { id },
    data: { status: "PUBLISHED", publishedAt: new Date(), updatedBy: adminId },
  });
  await logDseAudit(id, adminId, "PUBLISHED", existing.status, "PUBLISHED");
  return updated;
}

export async function unpublishAdminDseContent(id: string, adminId: string) {
  const existing = await requireLiveContent(id);
  if (existing.status !== "PUBLISHED") {
    throw new ApiError(400, "DSE_NOT_PUBLISHED", "Only published content can be unpublished");
  }
  const updated = await prisma.dseContent.update({
    where: { id },
    data: { status: "UNPUBLISHED", updatedBy: adminId },
  });
  await logDseAudit(id, adminId, "UNPUBLISHED", "PUBLISHED", "UNPUBLISHED");
  return updated;
}

export async function archiveAdminDseContent(id: string, adminId: string) {
  const existing = await requireLiveContent(id);
  if (existing.status === "ARCHIVED") {
    throw new ApiError(400, "DSE_ALREADY_ARCHIVED", "DSE content is already archived");
  }
  const updated = await prisma.dseContent.update({
    where: { id },
    data: { status: "ARCHIVED", updatedBy: adminId },
  });
  await logDseAudit(id, adminId, "ARCHIVED", existing.status, "ARCHIVED");
  return updated;
}

export async function unarchiveAdminDseContent(id: string, adminId: string) {
  const existing = await requireLiveContent(id);
  if (existing.status !== "ARCHIVED") {
    throw new ApiError(400, "DSE_NOT_ARCHIVED", "Only archived content can be unarchived");
  }
  const updated = await prisma.dseContent.update({
    where: { id },
    data: { status: "DRAFT", updatedBy: adminId },
  });
  await logDseAudit(id, adminId, "UNARCHIVED", "ARCHIVED", "DRAFT");
  return updated;
}

export async function setAdminDseFeatured(id: string, adminId: string, featured: boolean) {
  await requireLiveContent(id);
  const updated = await prisma.dseContent.update({
    where: { id },
    data: { isFeatured: featured, updatedBy: adminId },
  });
  await logDseAudit(id, adminId, featured ? "FEATURED" : "UNFEATURED", updated.status, updated.status);
  return updated;
}

export async function setAdminDsePinned(id: string, adminId: string, pinned: boolean) {
  await requireLiveContent(id);
  const updated = await prisma.dseContent.update({
    where: { id },
    data: { isPinned: pinned, updatedBy: adminId },
  });
  await logDseAudit(id, adminId, pinned ? "PINNED" : "UNPINNED", updated.status, updated.status);
  return updated;
}

// ---------------------------------------------------------------- admin: categories

export async function listAdminDseCategories() {
  return prisma.dseCategory.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function getAdminDseCategory(id: string) {
  const category = await prisma.dseCategory.findUnique({ where: { id } });
  if (!category || category.deletedAt) {
    throw new ApiError(404, "DSE_CATEGORY_NOT_FOUND", "DSE category not found");
  }
  return category;
}

export async function createAdminDseCategory(input: DseCategoryCreateInput) {
  const slug = await uniqueCategorySlug(slugifyTitle(input.name));
  return prisma.dseCategory.create({
    data: {
      name: input.name,
      slug,
      description: input.description ?? null,
      icon: input.icon ?? null,
      imageUrl: input.imageUrl ?? null,
      sortOrder: input.sortOrder ?? 0,
      isActive: true,
    },
  });
}

export async function updateAdminDseCategory(id: string, input: DseCategoryUpdateInput) {
  await getAdminDseCategory(id);
  return prisma.dseCategory.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl ?? null }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });
}

/** Soft delete — blocked while any live content references the category. */
export async function deleteAdminDseCategory(id: string) {
  await getAdminDseCategory(id);
  const inUse = await prisma.dseContent.count({
    where: { categoryId: id, deletedAt: null },
  });
  if (inUse > 0) {
    throw new ApiError(
      400,
      "DSE_CATEGORY_IN_USE",
      `Category is referenced by ${inUse} live content item(s) — move or delete them first`,
    );
  }
  await prisma.dseCategory.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id, deleted: true };
}

// ---------------------------------------------------------------- public (mobile app)

/** Critical gate: ONLY published, non-deleted content with a live category is public. */
function publicContentWhere(query: PublicDseContentQuery): Prisma.DseContentWhereInput {
  const where: Prisma.DseContentWhereInput = {
    status: "PUBLISHED",
    deletedAt: null,
    category: { isActive: true, deletedAt: null },
  };
  if (query.contentType) where.contentType = query.contentType;
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.featured !== undefined) where.isFeatured = query.featured === "true";
  if (query.pinned !== undefined) where.isPinned = query.pinned === "true";
  if (query.search) {
    where.OR = [
      { title: { contains: query.search } },
      { shortDescription: { contains: query.search } },
      { description: { contains: query.search } },
      { category: { name: { contains: query.search } } },
    ];
  }
  return where;
}

const publicCardSelect = {
  id: true,
  title: true,
  slug: true,
  shortDescription: true,
  contentType: true,
  thumbnailUrl: true,
  publishedAt: true,
  isFeatured: true,
  isPinned: true,
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.DseContentSelect;

export async function listPublicDseContent(query: PublicDseContentQuery) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const where = publicContentWhere(query);
  const orderBy: Prisma.DseContentOrderByWithRelationInput =
    query.sort === "oldest" ? { publishedAt: "asc" } : { publishedAt: "desc" };

  const [items, total] = await Promise.all([
    prisma.dseContent.findMany({ where, select: publicCardSelect, skip: (page - 1) * pageSize, take: pageSize, orderBy }),
    prisma.dseContent.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getPublicDseContentBySlug(slug: string) {
  const content = await prisma.dseContent.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
      slug: true,
      shortDescription: true,
      description: true,
      contentType: true,
      thumbnailUrl: true,
      coverImageUrl: true,
      externalUrl: true,
      authorName: true,
      sourceName: true,
      sourceUrl: true,
      publishedAt: true,
      isFeatured: true,
      isPinned: true,
      status: true,
      deletedAt: true,
      category: { select: { id: true, name: true, slug: true, isActive: true, deletedAt: true } },
      media: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (
    !content ||
    content.status !== "PUBLISHED" ||
    content.deletedAt ||
    !content.category ||
    !content.category.isActive ||
    content.category.deletedAt
  ) {
    throw new ApiError(404, "DSE_CONTENT_NOT_FOUND", "DSE content not found");
  }
  const { status: _status, deletedAt: _deletedAt, ...rest } = content;
  void _status;
  void _deletedAt;
  return {
    ...rest,
    category: {
      id: rest.category.id,
      name: rest.category.name,
      slug: rest.category.slug,
    },
  };
}

export async function listPublicFeaturedDseContent(page = 1, pageSize = 20) {
  return listPublicDseContent({ page, pageSize, featured: "true", sort: "latest" } as PublicDseContentQuery);
}

export async function listPublicPinnedDseContent(page = 1, pageSize = 20) {
  return listPublicDseContent({ page, pageSize, pinned: "true", sort: "latest" } as PublicDseContentQuery);
}

/** Public categories — active + non-deleted only. */
export async function listPublicDseCategories() {
  return prisma.dseCategory.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, name: true, slug: true, description: true, icon: true, imageUrl: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

// ---------------------------------------------------------------- public rate limiting

/** Per-IP read budget for the public DSE feed (scrape protection). */
export async function assertDsePublicRateLimit(req: NextRequest): Promise<void> {
  const ip = getClientIp(req.headers);
  const { allowed } = await getRateLimiter().consume(`dse-public:${ip}`, DSE_PUBLIC_RATE_LIMIT);
  if (!allowed) {
    throw new ApiError(429, "RATE_LIMITED", "Too many requests — slow down and retry");
  }
}
