import { prisma } from "@/lib/prisma";
import { ApiError } from "@/middleware/errorHandler";
import { requireOwnedMedia, requireOwnedMediaMany } from "@/modules/media/media.service";
import { geocodeAddress } from "@/modules/location/location.service";
import { generateDigiPin } from "@/modules/digipin/digipin.service";
import { getDistrict, findDistrictByName } from "@/modules/districts/districts";
import { buildQrData } from "@/modules/qr/qr.payload";
import type { PropertyType, OwnershipType, VerificationStatus } from "@prisma/client";

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
  /** Alternative to districtCode — resolved to a code server-side. */
  districtName?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
}

export type UpdatePropertyInput = Partial<CreatePropertyInput>;

/**
 * District resolution shared by create/PATCH/submit: an explicit code wins
 * (existence validated, canonical name snapshotted); otherwise a sent name
 * is resolved via the LGD dataset, scoped by state when it parses. When
 * both are sent they must agree — a silent pick would hide frontend bugs.
 */
function resolveDistrictInput(input: {
  districtCode?: number;
  districtName?: string;
  state?: string;
}): { districtCode?: number; districtName?: string } {
  if (input.districtCode !== undefined) {
    const district = getDistrict(input.districtCode);
    if (
      input.districtName !== undefined &&
      input.districtName.trim().toLowerCase() !== district.name.toLowerCase()
    ) {
      throw new ApiError(
        400,
        "DISTRICT_NAME_MISMATCH",
        `districtName "${input.districtName.trim()}" does not match districtCode ${district.code} (${district.name}).`,
      );
    }
    return { districtCode: district.code, districtName: district.name };
  }
  if (input.districtName !== undefined) {
    const district = findDistrictByName(input.districtName, input.state);
    return { districtCode: district.code, districtName: district.name };
  }
  return {};
}

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
  // District is optional at create (and at submit since the codec revert).
  // A sent name is auto-resolved to its code; the canonical dataset name is
  // snapshotted either way. Strict state cross-check happens at submit.
  const resolved = resolveDistrictInput(input);
  return prisma.property.create({
    data: { userId, ...input, ...resolved },
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

  // Resolve district input (code wins, else name auto-resolved — scoped by
  // the PATCH state when sent, else the stored state). The canonical name is
  // snapshotted; strict state cross-check happens at submit.
  const resolved = resolveDistrictInput({ ...data, state: data.state ?? property.state ?? undefined });

  return prisma.property.update({
    where: { id: property.id },
    data: { ...data, ...resolved },
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
 * Submit: validates completeness, enforces DRAFT|REJECTED→SUBMITTED, then
 * generates the DigiPin (SS + 4-digit random + pincode suffix) and
 * associates a QR — inside a transaction.
 *
 * The DigiPin is NEVER returned here: it stays invisible on every non-admin
 * surface until an admin approves the property via
 * PATCH /admin/properties/{id}/verification.
 *
 * Resubmit after REJECTED issues a FRESH number on the existing DigiPin row
 * and resets it to SUBMITTED, keeping the existing QR token.
 *
 * District is optional (stored + displayed when sent, by code or by name).
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
    districtCode?: number;
    districtName?: string;
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

  // District is optional: an explicit code wins, else a sent name is
  // auto-resolved (scoped by the submitted state); the canonical dataset
  // name is snapshotted. The old-formula number needs only state + pincode.
  const resolved = resolveDistrictInput(data);

  // Interactive-tx budget: several sequential writes on a cold hosted DB can
  // approach Prisma's 5s default — 15s ceiling. Retry once on expiry (P2028):
  // an expired transaction rolls back, and generateDigiPin already absorbs
  // P2002 collisions, so the retry is side-effect free.
  const runTx = () =>
    prisma.$transaction(async (tx) => {
    // propertyImages/selfieImage/districtName are submit-gate fields only —
    // districtName is resolved into districtCode above, so strip the helpers
    // before the DB update (districtCode/districtName columns set explicitly).
    const { propertyImages: _propertyImages, selfieImage: _selfieImage, districtName: _districtName, ...updateData } = data;
    const updated = await tx.property.update({
      where: { id: propertyId },
      data: {
        ...updateData,
        ...resolved,
        latitude,
        longitude,
        verificationStatus: "SUBMITTED",
      },
    });

    // First submit creates the DigiPin row; a resubmit after REJECTED issues
    // a fresh number on the existing row and resets it to SUBMITTED. A blind
    // create here would P2002 on propertyId @unique. generateDigiPin returns
    // the number (not the row), so the row id is captured alongside.
    const existing = await tx.digiPin.findUnique({ where: { propertyId } });
    let digipinId: string;
    let digipinNumber: string;
    if (existing) {
      digipinId = existing.id;
      digipinNumber = await generateDigiPin(data.state, data.pincode, {
        persist: (n) =>
          tx.digiPin.update({
            where: { id: existing.id },
            data: { digipinNumber: n, verificationStatus: "SUBMITTED" },
          }),
      });
    } else {
      digipinId = "";
      digipinNumber = await generateDigiPin(data.state, data.pincode, {
        persist: async (n) => {
          const created = await tx.digiPin.create({ data: { propertyId, digipinNumber: n } });
          digipinId = created.id;
        },
      });
    }

    // The QR payload is always the CURRENT number — upsert so a resubmit
    // (fresh number) never leaves a stale payload behind. The payload is the
    // DigiPin number itself (plain text, see qr.payload.ts).
    await tx.qR.upsert({
      where: { digipinId },
      update: { qrData: buildQrData(digipinNumber) },
      create: { digipinId, qrData: buildQrData(digipinNumber) },
    });

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
