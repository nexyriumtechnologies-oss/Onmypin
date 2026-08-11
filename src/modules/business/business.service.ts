import { prisma } from "@/lib/prisma";
import { ApiError } from "@/middleware/errorHandler";
import { deleteMediaFileIfOwned } from "@/modules/media/media.service";
import { geocodeAddress, distanceMeters } from "@/modules/location/location.service";

type DbClient = Pick<typeof prisma, "businessCategory">;

type DecimalLike = { toNumber(): number } | number | null | undefined;

function num(v: DecimalLike): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === "number" ? v : v.toNumber();
}

/** A business detail row as shaped by BUSINESS_DETAIL_SELECT. */
export interface BusinessDetailRow {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  latitude: DecimalLike;
  longitude: DecimalLike;
  contactPhone: string | null;
  contactEmail: string | null;
  verificationStatus: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  category: { id: string; name: string } | null;
  subcategory: { id: string; name: string } | null;
  images: Array<{ id: string; fileId: string; order: number }>;
}

export const MAX_BUSINESS_IMAGES = 5;

const BUSINESS_DETAIL_SELECT = {
  id: true,
  ownerUserId: true,
  name: true,
  categoryId: true,
  subcategoryId: true,
  address: true,
  city: true,
  state: true,
  pincode: true,
  latitude: true,
  longitude: true,
  contactPhone: true,
  contactEmail: true,
  logoFileId: true,
  verificationStatus: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  subcategory: { select: { id: true, name: true } },
  images: { select: { id: true, fileId: true, order: true }, orderBy: { order: "asc" as const } },
} as const;

const PUBLIC_LIST_SELECT = {
  id: true,
  name: true,
  city: true,
  state: true,
  verificationStatus: true,
  status: true,
  latitude: true,
  longitude: true,
  logoFileId: true,
  category: { select: { id: true, name: true } },
  subcategory: { select: { id: true, name: true } },
} as const;

/** A business is only publicly visible once VERIFIED and ACTIVE. */
export function isBusinessPubliclyVisible(verificationStatus: string, status: string): boolean {
  return verificationStatus === "VERIFIED" && status === "ACTIVE";
}

/**
 * Category/subcategory must exist, be active, and a subcategory must belong to
 * the chosen category. Runs against `db` so it works inside a transaction too.
 */
async function assertValidCategory(
  db: DbClient,
  categoryId?: string | null,
  subcategoryId?: string | null,
): Promise<void> {
  if (categoryId) {
    const category = await db.businessCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, isActive: true },
    });
    if (!category || !category.isActive) {
      throw new ApiError(400, "INVALID_CATEGORY", "Business category does not exist or is inactive");
    }
  }
  if (subcategoryId) {
    const sub = await db.businessCategory.findUnique({
      where: { id: subcategoryId },
      select: { id: true, parentId: true, isActive: true },
    });
    if (!sub || !sub.isActive) {
      throw new ApiError(400, "INVALID_CATEGORY", "Business subcategory does not exist or is inactive");
    }
    if (categoryId && sub.parentId !== categoryId) {
      throw new ApiError(400, "INVALID_CATEGORY", "Subcategory does not belong to the selected category");
    }
  }
}

/** A new business always starts PENDING and ACTIVE, owned by the caller. */
export async function createBusiness(userId: string, input: {
  name: string;
  categoryId?: string;
  subcategoryId?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  contactPhone?: string;
  contactEmail?: string;
}) {
  return prisma.$transaction(async (tx) => {
    await assertValidCategory(tx, input.categoryId, input.subcategoryId);
    return tx.business.create({
      data: {
        ownerUserId: userId,
        ...input,
        verificationStatus: "PENDING",
        status: "ACTIVE",
      },
      select: BUSINESS_DETAIL_SELECT,
    });
  });
}

/** Ownership check — a user can only ever reach their own business. */
async function getOwnedBusiness(userId: string, businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: BUSINESS_DETAIL_SELECT,
  });
  if (!business || business.ownerUserId !== userId) {
    // Identical 404 whether the business is foreign or does not exist.
    throw new ApiError(404, "BUSINESS_NOT_FOUND", "Business not found");
  }
  return business;
}

export async function updateBusiness(
  userId: string,
  businessId: string,
  input: Record<string, unknown>,
) {
  const business = await getOwnedBusiness(userId, businessId);

  // PATCH can never change verification status or ownership — those are
  // controlled by the verification-request flow and the admin panel.
  const { verificationStatus: _attemptedStatus, ownerUserId: _attemptedOwner, ...data } = input;
  if (_attemptedStatus && _attemptedStatus !== business.verificationStatus) {
    throw new ApiError(
      400,
      "INVALID_STATUS_TRANSITION",
      "Verification status can only change via the verification-request flow",
    );
  }
  if (_attemptedOwner) {
    throw new ApiError(400, "FORBIDDEN_FIELD", "Ownership cannot be transferred via PATCH");
  }

  await assertValidCategory(
    prisma,
    typeof data.categoryId === "string" ? data.categoryId : undefined,
    typeof data.subcategoryId === "string" ? data.subcategoryId : undefined,
  );

  await prisma.business.update({ where: { id: businessId }, data });
  return getBusinessDetail(userId, businessId);
}

/**
 * Public-safe detail view: VERIFIED + ACTIVE businesses are public (with
 * contact info — verification is what makes it trustworthy to share). Anything
 * else is owner-only, and a non-owner asking for a non-verified business gets
 * the same 404 as a missing one (no existence leak).
 */
export async function getBusinessDetail(viewerUserId: string | null, businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: BUSINESS_DETAIL_SELECT,
  });
  if (!business) {
    throw new ApiError(404, "BUSINESS_NOT_FOUND", "Business not found");
  }
  const isOwner = viewerUserId !== null && business.ownerUserId === viewerUserId;
  if (!isOwner && !isBusinessPubliclyVisible(business.verificationStatus, business.status)) {
    throw new ApiError(404, "BUSINESS_NOT_FOUND", "Business not found");
  }

  const fileIds = [
    ...business.images.map((img) => img.fileId),
    business.logoFileId ?? "",
  ].filter(Boolean);
  const files = await prisma.mediaFile.findMany({
    where: { id: { in: fileIds } },
    select: { id: true, url: true },
  });
  const urlById = new Map(files.map((f) => [f.id, f.url]));

  return projectBusinessDetail(business, {
    logoUrl: business.logoFileId ? (urlById.get(business.logoFileId) ?? null) : null,
    imageUrlByFileId: urlById,
  });
}

/**
 * Full business projection (owner view + public VERIFIED detail). Contact info
 * is included because VERIFIED status is what authorizes it to be public.
 */
export function projectBusinessDetail(
  row: BusinessDetailRow,
  media: { logoUrl: string | null; imageUrlByFileId: Map<string, string> },
) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    verificationStatus: row.verificationStatus,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    category: row.category ? { id: row.category.id, name: row.category.name } : null,
    subcategory: row.subcategory ? { id: row.subcategory.id, name: row.subcategory.name } : null,
    logoUrl: media.logoUrl,
    images: row.images.map((img) => ({
      id: img.id,
      fileId: img.fileId,
      url: media.imageUrlByFileId.get(img.fileId) ?? null,
      order: img.order,
    })),
  };
}

/**
 * Directory-card projection — deliberately contact/address-free. Contact info
 * only ever appears on the detail view of a VERIFIED business.
 */
export function projectBusinessList(row: {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  verificationStatus: string;
  status: string;
  latitude: DecimalLike;
  longitude: DecimalLike;
  logoFileId: string | null;
  category: { id: string; name: string } | null;
  subcategory: { id: string; name: string } | null;
}, logoUrl: string | null) {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    state: row.state,
    verificationStatus: row.verificationStatus,
    status: row.status,
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    logoUrl,
    category: row.category ? { id: row.category.id, name: row.category.name } : null,
    subcategory: row.subcategory ? { id: row.subcategory.id, name: row.subcategory.name } : null,
  };
}

/** Prisma filter for the public directory — VERIFIED + ACTIVE only. */
export function businessWherePublic(input: {
  q?: string;
  categoryId?: string;
  city?: string;
  state?: string;
}): object {
  const where: Record<string, unknown> = { verificationStatus: "VERIFIED", status: "ACTIVE" };
  if (input.categoryId) where.categoryId = input.categoryId;
  if (input.city) where.city = { contains: input.city };
  if (input.state) where.state = { contains: input.state };
  if (input.q) {
    where.OR = [
      { name: { contains: input.q } },
      { address: { contains: input.q } },
      { city: { contains: input.q } },
      { state: { contains: input.q } },
    ];
  }
  return where;
}

async function attachLogos<T extends { logoFileId: string | null }>(
  rows: T[],
  project: (row: T, logoUrl: string | null) => ReturnType<typeof projectBusinessList>,
): Promise<Array<ReturnType<typeof projectBusinessList>>> {
  const ids = [...new Set(rows.map((r) => r.logoFileId).filter(Boolean))] as string[];
  let urlById = new Map<string, string>();
  if (ids.length > 0) {
    const files = await prisma.mediaFile.findMany({
      where: { id: { in: ids } },
      select: { id: true, url: true },
    });
    urlById = new Map(files.map((f) => [f.id, f.url]));
  }
  return rows.map((row) =>
    project(row, row.logoFileId ? (urlById.get(row.logoFileId) ?? null) : null),
  );
}

export async function listMine(userId: string, page: number, pageSize: number) {
  const offset = (page - 1) * pageSize;
  const [rows, total] = await Promise.all([
    prisma.business.findMany({
      where: { ownerUserId: userId },
      select: BUSINESS_DETAIL_SELECT,
      orderBy: { updatedAt: "desc" },
      skip: offset,
      take: pageSize,
    }),
    prisma.business.count({ where: { ownerUserId: userId } }),
  ]);

  const fileIds = [...new Set(rows.flatMap((b) => [b.logoFileId ?? "", ...b.images.map((i) => i.fileId)].filter(Boolean)))] as string[];
  let urlById = new Map<string, string>();
  if (fileIds.length > 0) {
    const files = await prisma.mediaFile.findMany({
      where: { id: { in: fileIds } },
      select: { id: true, url: true },
    });
    urlById = new Map(files.map((f) => [f.id, f.url]));
  }

  return {
    items: rows.map((row) =>
      projectBusinessDetail(row, {
        logoUrl: row.logoFileId ? (urlById.get(row.logoFileId) ?? null) : null,
        imageUrlByFileId: urlById,
      }),
    ),
    total,
    page,
    pageSize,
  };
}

export async function listPublicBusinesses(input: {
  q?: string;
  categoryId?: string;
  city?: string;
  state?: string;
  lat?: number;
  lng?: number;
  radiusKm: number;
  page: number;
  pageSize: number;
}) {
  const where = businessWherePublic(input);
  const { page, pageSize } = input;
  const offset = (page - 1) * pageSize;

  const hasNearby = input.lat !== undefined && input.lng !== undefined;
  if (hasNearby) {
    const rows = await prisma.business.findMany({ where, select: PUBLIC_LIST_SELECT });
    const scored: Array<{ row: (typeof rows)[number]; distanceMeters: number }> = [];
    for (const row of rows) {
      const lat = num(row.latitude);
      const lng = num(row.longitude);
      if (lat === null || lng === null) continue;
      const distance = distanceMeters(input.lat!, input.lng!, lat, lng);
      if (distance <= input.radiusKm * 1000) {
        scored.push({ row, distanceMeters: Math.round(distance) });
      }
    }
    scored.sort((a, b) => a.distanceMeters - b.distanceMeters);
    const pageRows = scored.slice(offset, offset + pageSize);
    const items = await attachLogos(pageRows.map((p) => p.row), projectBusinessList);
    return {
      items: items.map((item, i) => ({ ...item, distanceMeters: pageRows[i]!.distanceMeters })),
      total: scored.length,
      page,
      pageSize,
    };
  }

  const [rows, total] = await Promise.all([
    prisma.business.findMany({
      where,
      select: PUBLIC_LIST_SELECT,
      orderBy: { updatedAt: "desc" },
      skip: offset,
      take: pageSize,
    }),
    prisma.business.count({ where }),
  ]);
  const items = await attachLogos(rows, projectBusinessList);
  return { items, total, page, pageSize };
}

/**
 * Verification request gate: the business must be complete enough to review
 * (name, category, address, city, state, at least one image, and a contact).
 * Only PENDING/REJECTED may move to UNDER_REVIEW. Missing coordinates are
 * geocoded from the stored address at this point (users never type coords).
 */
export async function requestVerification(userId: string, businessId: string) {
  const business = await getOwnedBusiness(userId, businessId);

  if (!["PENDING", "REJECTED"].includes(business.verificationStatus)) {
    throw new ApiError(
      400,
      "INVALID_STATUS_TRANSITION",
      `Cannot request verification for a ${business.verificationStatus} business`,
    );
  }

  const imageCount = await prisma.businessImage.count({ where: { businessId } });
  const missing: string[] = [];
  if (!business.name) missing.push("name");
  if (!business.categoryId) missing.push("category");
  if (!business.address) missing.push("address");
  if (!business.city) missing.push("city");
  if (!business.state) missing.push("state");
  if (imageCount < 1) missing.push("images");
  if (!business.contactPhone && !business.contactEmail) missing.push("contact");
  if (missing.length > 0) {
    throw new ApiError(400, "BUSINESS_INCOMPLETE", `Business is missing: ${missing.join(", ")}`);
  }

  let latitude = num(business.latitude);
  let longitude = num(business.longitude);
  if (latitude === null || longitude === null) {
    const fullAddress = [business.address, business.city, business.state, business.pincode]
      .filter(Boolean)
      .join(", ");
    const geo = await geocodeAddress(fullAddress);
    latitude = geo.latitude;
    longitude = geo.longitude;
  }

  const updated = await prisma.business.update({
    where: { id: businessId },
    data: { verificationStatus: "UNDER_REVIEW", latitude, longitude },
    select: { id: true, verificationStatus: true, updatedAt: true },
  });
  return updated;
}

/** Attaches an already-uploaded BUSINESS_IMAGE file to an owned business. */
export async function attachBusinessImage(userId: string, businessId: string, fileId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, ownerUserId: true },
  });
  if (!business || business.ownerUserId !== userId) {
    throw new ApiError(404, "BUSINESS_NOT_FOUND", "Business not found");
  }
  const count = await prisma.businessImage.count({ where: { businessId } });
  if (count >= MAX_BUSINESS_IMAGES) {
    throw new ApiError(
      400,
      "BUSINESS_IMAGE_LIMIT",
      `A business can have at most ${MAX_BUSINESS_IMAGES} images`,
    );
  }
  return prisma.businessImage.create({
    data: { businessId, fileId, order: count },
    select: { id: true, businessId: true, fileId: true, order: true, createdAt: true },
  });
}

/** Replaces the logo slot for an owned business (old owned file is deleted). */
export async function setBusinessLogo(userId: string, businessId: string, fileId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, ownerUserId: true, logoFileId: true },
  });
  if (!business || business.ownerUserId !== userId) {
    throw new ApiError(404, "BUSINESS_NOT_FOUND", "Business not found");
  }
  if (business.logoFileId) {
    await deleteMediaFileIfOwned(userId, business.logoFileId);
  }
  return prisma.business.update({
    where: { id: businessId },
    data: { logoFileId: fileId },
    select: { id: true, logoFileId: true, updatedAt: true },
  });
}

/** Removes one business image (join row + the owned media file). */
export async function removeBusinessImage(userId: string, businessImageId: string) {
  const image = await prisma.businessImage.findUnique({
    where: { id: businessImageId },
    select: { id: true, fileId: true, business: { select: { ownerUserId: true } } },
  });
  if (!image || image.business.ownerUserId !== userId) {
    // Identical 404 whether the image is foreign or does not exist.
    throw new ApiError(404, "BUSINESS_IMAGE_NOT_FOUND", "Business image not found");
  }
  await prisma.businessImage.delete({ where: { id: image.id } });
  await deleteMediaFileIfOwned(userId, image.fileId);
}

/** Active category tree — top-level categories with their active subcategories. */
export async function listActiveCategories() {
  const rows = await prisma.businessCategory.findMany({
    where: { isActive: true },
    orderBy: { order: "asc" },
    select: {
      id: true,
      name: true,
      parentId: true,
      order: true,
      children: {
        where: { isActive: true },
        orderBy: { order: "asc" },
        select: { id: true, name: true, order: true },
      },
    },
  });
  return rows
    .filter((c) => c.parentId === null)
    .map((c) => ({
      id: c.id,
      name: c.name,
      order: c.order,
      subcategories: c.children,
    }));
}
