import { prisma } from "@/lib/prisma";
import { distanceMeters } from "@/modules/location/location.service";

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type SearchType = "digipin" | "address" | "business" | "all";
export type NearbyType = "property" | "business" | "all";

/**
 * Privacy-safe search result for a property/DigiPin. PUBLIC projection —
 * only the DigiPin number + city/state (plus non-PII verification status and
 * coordinates for map display). NEVER the full address, owner name, or media.
 */
export interface PropertySearchItem {
  kind: "property";
  id: string;
  digipinId: string;
  digipinNumber: string;
  city: string | null;
  state: string | null;
  verificationStatus: string;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Privacy-safe search result for a business — public projection. Businesses
 * are public entities, so name/category/city/state are fine; contact info is
 * only revealed on the business detail view per verification status rules.
 */
export interface BusinessSearchItem {
  kind: "business";
  id: string;
  name: string;
  categoryName: string | null;
  city: string | null;
  state: string | null;
  verificationStatus: string;
  latitude: number | null;
  longitude: number | null;
}

export type SearchResultItem = PropertySearchItem | BusinessSearchItem;

const propertySearchSelect = {
  id: true,
  city: true,
  state: true,
  verificationStatus: true,
  latitude: true,
  longitude: true,
  digiPin: { select: { id: true, digipinNumber: true } },
} as const;

const businessSearchSelect = {
  id: true,
  name: true,
  city: true,
  state: true,
  verificationStatus: true,
  latitude: true,
  longitude: true,
  category: { select: { name: true } },
} as const;

/** Maps a raw property row to the PUBLIC search projection (no PII). */
export function projectPropertySearch(row: {
  id: string;
  city: string | null;
  state: string | null;
  verificationStatus: string;
  latitude: { toNumber(): number } | number | null;
  longitude: { toNumber(): number } | number | null;
  digiPin: { id: string; digipinNumber: string } | null;
}): PropertySearchItem | null {
  if (!row.digiPin) return null; // only submitted properties are searchable
  return {
    kind: "property",
    id: row.id,
    digipinId: row.digiPin.id,
    digipinNumber: row.digiPin.digipinNumber,
    city: row.city,
    state: row.state,
    verificationStatus: row.verificationStatus,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
  };
}

/** Maps a raw business row to the PUBLIC search projection. */
export function projectBusinessSearch(row: {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  verificationStatus: string;
  latitude: { toNumber(): number } | number | null;
  longitude: { toNumber(): number } | number | null;
  category: { name: string } | null;
}): BusinessSearchItem {
  return {
    kind: "business",
    id: row.id,
    name: row.name,
    categoryName: row.category?.name ?? null,
    city: row.city,
    state: row.state,
    verificationStatus: row.verificationStatus,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
  };
}

function toNumber(v: { toNumber(): number } | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  return v.toNumber();
}

/**
 * Combines a property search and a business search into one paginated result.
 * `type` routes a single-type search to only one side; `all` merges both
 * (properties first, then businesses) with correct pagination across the two.
 */
export async function searchAll(input: {
  q: string;
  type: SearchType;
  page: number;
  pageSize: number;
}): Promise<PagedResult<SearchResultItem>> {
  const { q, type, page, pageSize } = input;
  const wantProperties = type === "all" || type === "digipin" || type === "address";
  const wantBusinesses = type === "all" || type === "business";

  const offset = (page - 1) * pageSize;

  const [propertyTotal, businessTotal] = await Promise.all([
    wantProperties ? prisma.property.count({ where: propertyWhere(q, type) }) : Promise.resolve(0),
    wantBusinesses ? prisma.business.count({ where: businessWhere(q) }) : Promise.resolve(0),
  ]);

  // Fill this page from properties first, then businesses for the remainder.
  const propertySkip = Math.min(offset, propertyTotal);
  const propertyTake = Math.max(0, Math.min(pageSize, propertyTotal - propertySkip));
  const remaining = pageSize - propertyTake;
  const businessSkip = Math.max(0, offset - propertyTotal);
  const businessTake = Math.max(0, Math.min(remaining, businessTotal - businessSkip));

  const [propertyRows, businessRows] = await Promise.all([
    wantProperties && propertyTake > 0
      ? prisma.property.findMany({
          where: propertyWhere(q, type),
          select: propertySearchSelect,
          orderBy: { updatedAt: "desc" },
          skip: propertySkip,
          take: propertyTake,
        })
      : Promise.resolve([]),
    wantBusinesses && businessTake > 0
      ? prisma.business.findMany({
          where: businessWhere(q),
          select: businessSearchSelect,
          orderBy: { updatedAt: "desc" },
          skip: businessSkip,
          take: businessTake,
        })
      : Promise.resolve([]),
  ]);

  const items: SearchResultItem[] = [
    ...propertyRows.map(projectPropertySearch).filter((r): r is PropertySearchItem => r !== null),
    ...businessRows.map(projectBusinessSearch),
  ];

  return { items, total: propertyTotal + businessTotal, page, pageSize };
}

/** Prisma filter for the property side of a search. */
export function propertyWhere(q: string, type: SearchType): object {
  if (type === "digipin") {
    // Nested relation filter implies the DigiPin exists.
    return { digiPin: { digipinNumber: { contains: q } } };
  }
  if (type === "address") {
    return {
      digiPin: { isNot: null },
      OR: [
        { address: { contains: q } },
        { city: { contains: q } },
        { state: { contains: q } },
        { pincode: { contains: q } },
      ],
    };
  }
  // type === "all" — DigiPin number OR any address field
  return {
    digiPin: { isNot: null },
    OR: [
      { digiPin: { digipinNumber: { contains: q } } },
      { address: { contains: q } },
      { city: { contains: q } },
      { state: { contains: q } },
    ],
  };
}

/** Prisma filter for the business side — public search only shows VERIFIED+ACTIVE. */
export function businessWhere(q: string): object {
  return {
    verificationStatus: "VERIFIED",
    status: "ACTIVE",
    OR: [
      { name: { contains: q } },
      { address: { contains: q } },
      { city: { contains: q } },
      { state: { contains: q } },
    ],
  };
}

export type NearbyResultItem = SearchResultItem & { distanceMeters: number };

/**
 * Nearby search over STORED coordinates (haversine) — no geocoder call at
 * query time. Combines submitted properties + verified businesses within the
 * radius, sorted by distance, paginated.
 */
export async function searchNearby(input: {
  lat: number;
  lng: number;
  radiusKm: number;
  type: NearbyType;
  page: number;
  pageSize: number;
}): Promise<PagedResult<NearbyResultItem>> {
  const { lat, lng, radiusKm, type, page, pageSize } = input;
  const radiusMeters = radiusKm * 1000;
  const wantProperties = type === "all" || type === "property";
  const wantBusinesses = type === "all" || type === "business";

  const [propertyRows, businessRows] = await Promise.all([
    wantProperties
      ? prisma.property.findMany({
          where: { digiPin: { isNot: null } },
          select: propertySearchSelect,
        })
      : Promise.resolve([]),
    wantBusinesses
      ? prisma.business.findMany({
          where: { verificationStatus: "VERIFIED", status: "ACTIVE" },
          select: businessSearchSelect,
        })
      : Promise.resolve([]),
  ]);

  const matches: NearbyResultItem[] = [];
  for (const row of propertyRows) {
    const projected = projectPropertySearch(row);
    if (!projected || projected.latitude === null || projected.longitude === null) continue;
    const distance = distanceMeters(lat, lng, projected.latitude, projected.longitude);
    if (distance <= radiusMeters) {
      matches.push({ ...projected, distanceMeters: Math.round(distance) });
    }
  }
  for (const row of businessRows) {
    const projected = projectBusinessSearch(row);
    if (projected.latitude === null || projected.longitude === null) continue;
    const distance = distanceMeters(lat, lng, projected.latitude, projected.longitude);
    if (distance <= radiusMeters) {
      matches.push({ ...projected, distanceMeters: Math.round(distance) });
    }
  }

  matches.sort((a, b) => a.distanceMeters - b.distanceMeters);
  const offset = (page - 1) * pageSize;
  return {
    items: matches.slice(offset, offset + pageSize),
    total: matches.length,
    page,
    pageSize,
  };
}

export const MAX_SEARCH_HISTORY = 50;

/** Records a search term against the current user; prunes history beyond 50. */
export async function recordSearch(userId: string, query: string, type: SearchType) {
  const created = await prisma.searchHistory.create({
    data: { userId, query, type },
    select: { id: true, query: true, type: true, createdAt: true },
  });

  const total = await prisma.searchHistory.count({ where: { userId } });
  if (total > MAX_SEARCH_HISTORY) {
    const oldest = await prisma.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      take: total - MAX_SEARCH_HISTORY,
      select: { id: true },
    });
    if (oldest.length > 0) {
      await prisma.searchHistory.deleteMany({
        where: { id: { in: oldest.map((o) => o.id) } },
      });
    }
  }
  return created;
}

export async function listSearchHistory(userId: string, page: number, pageSize: number) {
  const offset = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    prisma.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: pageSize,
      select: { id: true, query: true, type: true, createdAt: true },
    }),
    prisma.searchHistory.count({ where: { userId } }),
  ]);
  return { items, total, page, pageSize };
}
