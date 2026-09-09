import { prisma } from "@/lib/prisma";
import { ApiError } from "@/middleware/errorHandler";
import { requireOwnedMedia, requireOwnedMediaMany } from "@/modules/media/media.service";
import { geocodeAddress } from "@/modules/location/location.service";
import { encodeDigiPin } from "@/modules/digipin/digipin.codec";
import { getDistrict, assertDistrictInState } from "@/modules/districts/districts";
import { getStateCode } from "@/modules/digipin/stateCodes";
import { buildQrData } from "@/modules/qr/qr.payload";
import type { PropertyType, OwnershipType, VerificationStatus, DigiPin } from "@prisma/client";

/**
 * DigiPin visibility rule: the code is hidden from every non-admin surface
 * until an admin approves the property (VERIFIED). ACTIVE/INACTIVE only ever
 * follow VERIFIED, so they stay visible too.
 */
export const APPROVED_VERIFICATION_STATUSES: VerificationStatus[] = [
  "VERIFIED",
  "ACTIVE",
  "INACTIVE",
];

export interface CreatePropertyInput {
  ownerName: string;
  propertyType: PropertyType;
  ownershipType: OwnershipType;
  address?: string;
  city?: string;
  state?: string;
  districtCode?: number;
  pincode?: string;
  latitude?: number;
  longitude?: number;
}

export type UpdatePropertyInput = Partial<CreatePropertyInput>;

const PROPERTY_SELECT = {
  id: true,
  ownerName: true,
  propertyType: true,
  ownershipType: true,
  address: true,
  city: true,
  state: true,
  districtCode: true,
  districtName: true,
  pincode: true,
  latitude: true,
  longitude: true,
  verificationStatus: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** A new property always starts as a DRAFT owned by the caller. */
export async function createProperty(userId: string, input: CreatePropertyInput) {
  // District is optional at create (required at submit). Validate existence
  // now and snapshot the name; the strict state cross-check happens at submit
  // where state is mandatory.
  const districtName =
    input.districtCode !== undefined ? getDistrict(input.districtCode).name : undefined;
  return prisma.property.create({
    data: { userId, ...input, ...(districtName ? { districtName } : {}) },
    select: PROPERTY_SELECT,
  });
}

export async function listUserProperties(userId: string) {
  return prisma.property.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: PROPERTY_SELECT,
  });
}

/** Ownership check — a user can only ever access their own property. */
async function getOwnedProperty(userId: string, propertyId: string) {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: { digiPin: { select: { id: true, digipinNumber: true, status: true } } },
  });
  if (!property || property.userId !== userId) {
    throw new ApiError(404, "PROPERTY_NOT_FOUND", "Property not found");
  }
  return property;
}

export async function getProperty(userId: string, propertyId: string) {
  const property = await getOwnedProperty(userId, propertyId);
  const { userId: _ownerId, ...rest } = property;
  // DigiPin stays hidden until an admin approves the property — but tell the
  // owner plainly why instead of silently returning null.
  if (!APPROVED_VERIFICATION_STATUSES.includes(rest.verificationStatus)) {
    return {
      ...rest,
      digiPin: null,
      digipinStatus: "PENDING_APPROVAL",
      digipinMessage: "Your property is not approved yet. The DigiPin will appear here after admin approval.",
    };
  }
  return { ...rest, digipinStatus: "AVAILABLE" };
}

/** Status transitions — the client can never jump states server-side. */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["VERIFIED", "REJECTED"],
  VERIFIED: ["ACTIVE", "INACTIVE"],
  REJECTED: ["DRAFT", "SUBMITTED"],
  ACTIVE: ["INACTIVE"],
  INACTIVE: ["ACTIVE"],
};

export async function updateProperty(
  userId: string,
  propertyId: string,
  input: UpdatePropertyInput,
) {
  const property = await getOwnedProperty(userId, propertyId);

  // PATCH can never change verification status — it is controlled by the
  // dedicated submit/verification flows server-side.
  const { verificationStatus: _attempted, ...data } = input as UpdatePropertyInput & {
    verificationStatus?: string;
  };
  if (_attempted && _attempted !== property.verificationStatus) {
    throw new ApiError(
      400,
      "INVALID_STATUS_TRANSITION",
      "Verification status can only change via submit/verification flows",
    );
  }

  // Snapshot the district name when the code changes (existence validated;
  // strict state cross-check happens at submit).
  const districtName =
    data.districtCode !== undefined ? getDistrict(data.districtCode).name : undefined;

  return prisma.property.update({
    where: { id: property.id },
    data: { ...data, ...(districtName ? { districtName } : {}) },
    select: PROPERTY_SELECT,
  });
}

/** Prisma interactive-transaction expiry (P2028) — safe to retry once. */
function isTxExpiredError(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2028"
  );
}

/**
 * Encode a v1 DigiPin and persist it, retrying with fresh randomness on a
 * P2002 number collision (max 5). Only the rand part changes between
 * attempts, so district/coords stay identical.
 */
export async function persistUniqueDigiPin(
  persist: (digipinNumber: string) => Promise<DigiPin>,
  fields: { stateShort: string; districtCode: number; latitude: number; longitude: number },
): Promise<DigiPin> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const candidate = encodeDigiPin(fields);
    try {
      return await persist(candidate);
    } catch (err) {
      const isUniqueCollision =
        typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
      if (!isUniqueCollision) throw err;
    }
  }
  throw new ApiError(
    500,
    "DIGIPIN_GENERATION_FAILED",
    "Could not generate a unique DigiPin after 5 attempts",
  );
}

/**
 * Submit: validates completeness, enforces DRAFT|REJECTED→SUBMITTED, then
 * generates the v1 DigiPin (state + district + coords, checksum + rand) and
 * associates a QR — inside a transaction.
 *
 * The DigiPin is NEVER returned here: it stays invisible on every non-admin
 * surface until an admin approves the property via
 * PATCH /admin/properties/{id}/verification.
 *
 * Resubmit after REJECTED issues a FRESH number on the existing DigiPin row
 * (fresh rand) and resets it to SUBMITTED, keeping the existing QR token.
 *
 * Coordinates: latitude/longitude are OPTIONAL. When the client sends device
 * GPS those are stored; otherwise the server geocodes the full address
 * (address + city + state + pincode) and stores the geocoded point. Users
 * never type coordinates manually.
 */
export async function submitProperty(
  userId: string,
  propertyId: string,
  data: {
    ownerName: string;
    propertyType: PropertyType;
    ownershipType: OwnershipType;
    address: string;
    city: string;
    state: string;
    districtCode: number;
    pincode: string;
    latitude?: number;
    longitude?: number;
    propertyImages: string[];
    selfieImage: string;
  },
) {
  const property = await getOwnedProperty(userId, propertyId);
  const allowed = ALLOWED_TRANSITIONS[property.verificationStatus] ?? [];
  if (!allowed.includes("SUBMITTED")) {
    throw new ApiError(
      400,
      "INVALID_STATUS_TRANSITION",
      `Cannot submit a ${property.verificationStatus} property`,
    );
  }

  // Every referenced media file must exist, belong to this user, and match
  // its declared purpose — foreign or mismatched fileIds are rejected.
  await requireOwnedMediaMany(userId, data.propertyImages, "PROPERTY_IMAGE");
  await requireOwnedMedia(userId, data.selfieImage, "SELFIE");

  // Resolve final coordinates: GPS when provided, otherwise geocode the full
  // address. A geocoder failure surfaces as 502 GEOCODE_FAILED.
  let latitude = data.latitude;
  let longitude = data.longitude;
  if (latitude === undefined || longitude === undefined) {
    const fullAddress = `${data.address}, ${data.city}, ${data.state} ${data.pincode}`;
    const geo = await geocodeAddress(fullAddress);
    latitude = geo.latitude;
    longitude = geo.longitude;
  }

  // v1 code inputs: district must belong to the submitted state (strict);
  // coords are final here (device GPS or geocoded above).
  const stateShort = getStateCode(data.state);
  const district = assertDistrictInState(data.districtCode, stateShort);
  const codeFields = {
    stateShort,
    districtCode: district.code,
    latitude,
    longitude,
  };

  // Interactive-tx budget: several sequential writes on a cold hosted DB can
  // approach Prisma's 5s default — 15s ceiling. Retry once on expiry (P2028):
  // an expired transaction rolls back, and persistUniqueDigiPin already
  // absorbs P2002 collisions, so the retry is side-effect free.
  const runTx = () =>
    prisma.$transaction(async (tx) => {
    // propertyImages/selfieImage are submit-gate media references only — they
    // are not Property columns; strip them before the DB update.
    const { propertyImages: _propertyImages, selfieImage: _selfieImage, ...updateData } = data;
    const updated = await tx.property.update({
      where: { id: propertyId },
      data: {
        ...updateData,
        districtName: district.name,
        latitude,
        longitude,
        verificationStatus: "SUBMITTED",
      },
    });

    // First submit creates the DigiPin row; a resubmit after REJECTED issues
    // a fresh number on the existing row and resets it to SUBMITTED. A blind
    // create here would P2002 on propertyId @unique.
    const existing = await tx.digiPin.findUnique({ where: { propertyId } });
    const digiPin = existing
      ? await persistUniqueDigiPin(
          (n) =>
            tx.digiPin.update({
              where: { id: existing.id },
              data: { digipinNumber: n, verificationStatus: "SUBMITTED" },
            }),
          codeFields,
        )
      : await persistUniqueDigiPin(
          (n) => tx.digiPin.create({ data: { propertyId, digipinNumber: n } }),
          codeFields,
        );

    // Keep the existing QR on resubmit — only create one if missing. The
    // payload is the DigiPin number itself (plain text, see qr.payload.ts).
    const existingQr = await tx.qR.findUnique({ where: { digipinId: digiPin.id } });
    if (!existingQr) {
      await tx.qR.create({
        data: { digipinId: digiPin.id, qrData: buildQrData(digiPin.digipinNumber) },
      });
    }

    return { updated };
    }, { timeout: 15000, maxWait: 10000 });

  let result;
  try {
    result = await runTx();
  } catch (err) {
    if (!isTxExpiredError(err)) throw err;
    result = await runTx();
  }

  // DigiPin deliberately omitted — hidden until admin approval.
  return {
    property: {
      id: result.updated.id,
      verificationStatus: result.updated.verificationStatus,
    },
    message: "Property submitted. Your DigiPin will be visible after admin approval.",
  };
}
