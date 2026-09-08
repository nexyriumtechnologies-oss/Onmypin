import { prisma } from "@/lib/prisma";
import { ApiError } from "@/middleware/errorHandler";
import { APPROVED_VERIFICATION_STATUSES } from "@/modules/properties/property.service";
import { LEGACY_QR_URL_PREFIX, buildQrData, normalizeQrInput } from "@/modules/qr/qr.payload";

/**
 * QR codes carry the DigiPin number itself as plain text — any generic scan
 * shows the code. Returns the payload so a QR image can be rendered
 * client-side. Gated on admin approval: no QR is issued while the property
 * is unapproved.
 */
export async function getOrCreateQrForDigiPin(digipinId: string, userId: string) {
  const digiPin = await prisma.digiPin.findUnique({
    where: { id: digipinId },
    include: { property: { select: { userId: true, verificationStatus: true } } },
  });
  if (!digiPin || digiPin.property.userId !== userId) {
    throw new ApiError(404, "DIGIPIN_NOT_FOUND", "DigiPin not found");
  }
  // Ownership is checked first, so telling the owner plainly is safe — a
  // stranger still gets the identical 404 above (no existence leak).
  if (!APPROVED_VERIFICATION_STATUSES.includes(digiPin.property.verificationStatus)) {
    throw new ApiError(
      403,
      "PROPERTY_NOT_APPROVED",
      "Your property is not approved yet. The QR code will be available after admin approval.",
    );
  }

  const existing = await prisma.qR.findUnique({ where: { digipinId } });
  if (existing) {
    return { qrData: existing.qrData, qrStatus: existing.qrStatus, token: normalizeQrInput(existing.qrData) };
  }

  const qr = await prisma.qR.create({
    data: { digipinId, qrData: buildQrData(digiPin.digipinNumber) },
  });
  return { qrData: qr.qrData, qrStatus: qr.qrStatus, token: normalizeQrInput(qr.qrData) };
}

/**
 * Resolves a scanned payload server-side and returns ONLY authorized info
 * (DigiPin number + statuses). Exact-address/personal data is never exposed.
 * Accepts a raw DigiPin number (new QRs), a legacy bare token, or a full
 * legacy URL. Gated on admin approval: scanning a code for an unapproved
 * property returns the same generic 404 as a bogus payload (no probing).
 */
export async function verifyQrToken(input: string) {
  const key = normalizeQrInput(input);
  const qr = await prisma.qR.findFirst({
    where: { OR: [{ qrData: key }, { qrData: `${LEGACY_QR_URL_PREFIX}${key}` }] },
  });
  if (!qr || qr.qrStatus !== "ACTIVE") {
    throw new ApiError(404, "QR_NOT_FOUND", "QR code is invalid or disabled");
  }

  const digiPin = await prisma.digiPin.findUnique({
    where: { id: qr.digipinId },
    include: { property: { select: { city: true, state: true, districtName: true } } },
  });
  if (!digiPin || digiPin.status !== "ACTIVE") {
    throw new ApiError(410, "DIGIPIN_INACTIVE", "This DigiPin is not active");
  }
  if (!APPROVED_VERIFICATION_STATUSES.includes(digiPin.verificationStatus)) {
    throw new ApiError(404, "QR_NOT_FOUND", "QR code is invalid or disabled");
  }

  return {
    digipinNumber: digiPin.digipinNumber,
    status: digiPin.status,
    verificationStatus: digiPin.verificationStatus,
    city: digiPin.property.city ?? undefined,
    state: digiPin.property.state ?? undefined,
    districtName: digiPin.property.districtName ?? undefined,
  };
}
