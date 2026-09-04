import { prisma } from "@/lib/prisma";
import { ApiError } from "@/middleware/errorHandler";
import { generateOpaqueToken } from "@/lib/crypto";
import { APPROVED_VERIFICATION_STATUSES } from "@/modules/properties/property.service";

const QR_URL_PREFIX = "https://digipin.app/q/";

/**
 * QR codes reference a DigiPin through an opaque token — never raw
 * personal data. Returns the token so a QR image can be rendered client-side.
 * Gated on admin approval: no QR is issued while the property is unapproved.
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
    return { qrData: existing.qrData, qrStatus: existing.qrStatus, token: extractToken(existing.qrData) };
  }

  const token = generateOpaqueToken(16);
  const qr = await prisma.qR.create({
    data: { digipinId, qrData: `${QR_URL_PREFIX}${token}` },
  });
  return { qrData: qr.qrData, qrStatus: qr.qrStatus, token };
}

/**
 * Resolves an opaque QR token server-side and returns ONLY authorized info
 * (DigiPin number + statuses). Exact-address/personal data is never exposed.
 * Gated on admin approval: scanning a code for an unapproved property
 * returns the same generic 404 as a bogus token (no existence probing).
 */
export async function verifyQrToken(token: string) {
  const qr = await prisma.qR.findFirst({ where: { qrData: `${QR_URL_PREFIX}${token}` } });
  if (!qr || qr.qrStatus !== "ACTIVE") {
    throw new ApiError(404, "QR_NOT_FOUND", "QR code is invalid or disabled");
  }

  const digiPin = await prisma.digiPin.findUnique({
    where: { id: qr.digipinId },
    include: { property: { select: { city: true, state: true } } },
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
  };
}

function extractToken(qrData: string): string {
  return qrData.replace(QR_URL_PREFIX, "");
}
