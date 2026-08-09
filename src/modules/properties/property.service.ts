import { prisma } from "@/lib/prisma";
import { ApiError } from "@/middleware/errorHandler";
import { requireOwnedMedia, requireOwnedMediaMany } from "@/modules/media/media.service";
import { geocodeAddress } from "@/modules/location/location.service";
import type { PropertyType, OwnershipType } from "@prisma/client";

export interface CreatePropertyInput {
  ownerName: string;
  propertyType: PropertyType;
  ownershipType: OwnershipType;
  address?: string;
  city?: string;
  state?: string;
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
  pincode: true,
  latitude: true,
  longitude: true,
  verificationStatus: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** A new property always starts as a DRAFT owned by the caller. */
export async function createProperty(userId: string, input: CreatePropertyInput) {
  return prisma.property.create({
    data: { userId, ...input },
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
  return rest;
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

  return prisma.property.update({
    where: { id: property.id },
    data,
    select: PROPERTY_SELECT,
  });
}

/**
 * Submit: validates completeness, enforces DRAFT→SUBMITTED, then generates
 * the DigiPin and associates a QR — inside a transaction.
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

  const result = await prisma.$transaction(async (tx) => {
    // propertyImages/selfieImage are submit-gate media references only — they
    // are not Property columns; strip them before the DB update.
    const { propertyImages: _propertyImages, selfieImage: _selfieImage, ...updateData } = data;
    const updated = await tx.property.update({
      where: { id: propertyId },
      data: { ...updateData, latitude, longitude, verificationStatus: "SUBMITTED" },
    });

    const { generateDigiPin } = await import("@/modules/digipin/digipin.service");
    const digipinNumber = await generateDigiPin(data.state, data.pincode, {
      persist: (number) =>
        tx.digiPin.create({ data: { propertyId, digipinNumber: number } }),
    });

    const digiPin = await tx.digiPin.findUniqueOrThrow({ where: { propertyId } });

    const qrToken = (await import("@/lib/crypto")).generateOpaqueToken(16);
    await tx.qR.create({
      data: { digipinId: digiPin.id, qrData: `https://digipin.app/q/${qrToken}` },
    });

    return { updated, digipinNumber, digipinId: digiPin.id };
  });

  return {
    property: {
      id: result.updated.id,
      verificationStatus: result.updated.verificationStatus,
    },
    digipinNumber: result.digipinNumber,
    digipinId: result.digipinId,
  };
}
