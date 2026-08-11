import { prisma } from "@/lib/prisma";
import { ApiError } from "@/middleware/errorHandler";
import {
  TRUST_SCORE_MAX,
  TRUST_SCORE_FLOOR,
  TRUST_FACTOR_RULES,
  TRUST_PENALTY_RULES,
  ACCOUNT_AGE_BANDS,
} from "./trust-score.constants";

export interface TrustFactorBreakdown {
  code: string;
  label: string;
  points: number;
  units: number;
  details: string;
  applied: boolean;
}

export interface TrustScoreBreakdown {
  score: number;
  maxScore: number;
  factors: TrustFactorBreakdown[];
  penalties: TrustFactorBreakdown[];
  updatedAt: Date | null;
}

export interface TrustScoreInput {
  verifiedPropertyCount: number;
  verifiedBusinessCount: number;
  verifiedBusinessesWithImages: number;
  selfieUploaded: boolean;
  profileImagePresent: boolean;
  accountAgeDays: number;
  rejectedPropertyCount: number;
  rejectedBusinessCount: number;
}

export function accountAgeBand(days: number): number {
  for (const band of ACCOUNT_AGE_BANDS) {
    if (days >= band.minDays) return band.points;
  }
  return 0;
}

function ageInDays(createdAt: Date, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000)));
}

/** Pure derivation — no DB access, no persistence. Unit-testable in isolation. */
export function computeTrustScore(input: TrustScoreInput): TrustScoreBreakdown {
  const factors: TrustFactorBreakdown[] = [];
  let total = 0;

  for (const rule of TRUST_FACTOR_RULES) {
    let units = 0;
    switch (rule.code) {
      case "VERIFIED_PROPERTY":
        units = Math.min(input.verifiedPropertyCount, rule.maxUnits);
        break;
      case "VERIFIED_BUSINESS":
        units = Math.min(input.verifiedBusinessCount, rule.maxUnits);
        break;
      case "BUSINESS_IMAGES":
        units = Math.min(input.verifiedBusinessesWithImages, rule.maxUnits);
        break;
      case "SELFIE_UPLOADED":
        units = input.selfieUploaded ? 1 : 0;
        break;
      case "PROFILE_IMAGE":
        units = input.profileImagePresent ? 1 : 0;
        break;
      case "ACCOUNT_AGE":
        units = accountAgeBand(input.accountAgeDays) > 0 ? 1 : 0;
        break;
    }
    const points = rule.code === "ACCOUNT_AGE" ? accountAgeBand(input.accountAgeDays) : rule.points * units;
    const details = rule.unit === "count" ? `${units} / ${rule.maxUnits}` : "";
    factors.push({ code: rule.code, label: rule.label, points, units, details, applied: points > 0 });
    total += points;
  }

  const penalties: TrustFactorBreakdown[] = [];
  for (const rule of TRUST_PENALTY_RULES) {
    const units =
      rule.code === "REJECTED_PROPERTY"
        ? Math.min(input.rejectedPropertyCount, rule.maxUnits)
        : Math.min(input.rejectedBusinessCount, rule.maxUnits);
    const points = rule.points * units;
    penalties.push({
      code: rule.code,
      label: rule.label,
      points,
      units,
      details: `${units} / ${rule.maxUnits}`,
      applied: points < 0,
    });
    total += points;
  }

  const score = Math.max(TRUST_SCORE_FLOOR, Math.min(TRUST_SCORE_MAX, total));
  return { score, maxScore: TRUST_SCORE_MAX, factors, penalties, updatedAt: null };
}

async function collectFactorCounts(userId: string): Promise<TrustScoreInput> {
  const [verifiedPropertyCount, verifiedBusinessCount, selfieUploaded, rejectedPropertyCount, rejectedBusinessCount, verifiedBusinessesWithImages] =
    await Promise.all([
      prisma.property.count({ where: { userId, verificationStatus: "VERIFIED" } }),
      prisma.business.count({ where: { ownerUserId: userId, verificationStatus: "VERIFIED", status: "ACTIVE" } }),
      prisma.mediaFile.count({ where: { userId, purpose: "SELFIE" } }),
      prisma.property.count({ where: { userId, verificationStatus: "REJECTED" } }),
      prisma.business.count({ where: { ownerUserId: userId, verificationStatus: "REJECTED" } }),
      prisma.business
        .findMany({
          where: { ownerUserId: userId, verificationStatus: "VERIFIED", status: "ACTIVE", images: { some: {} } },
          select: { id: true },
        })
        .then((rows) => rows.length),
    ]);
  return {
    verifiedPropertyCount,
    verifiedBusinessCount,
    verifiedBusinessesWithImages,
    selfieUploaded: selfieUploaded > 0,
    profileImagePresent: false,
    accountAgeDays: 0,
    rejectedPropertyCount,
    rejectedBusinessCount,
  };
}

/** Read-only view for GET /api/users/me/trust-score — derives but NEVER persists. */
export async function getTrustScore(userId: string): Promise<{ breakdown: TrustScoreBreakdown }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, createdAt: true, profileImage: true, trustScoreUpdatedAt: true },
  });
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "User not found");

  const counts = await collectFactorCounts(userId);
  const breakdown = computeTrustScore({
    ...counts,
    profileImagePresent: user.profileImage != null,
    accountAgeDays: ageInDays(user.createdAt),
  });
  breakdown.updatedAt = user.trustScoreUpdatedAt;
  return { breakdown };
}

/**
 * Recompute + persist a user's trust score. Called by the admin verification
 * routes (Module 7) after an approve/reject; never exposed as a user route.
 */
export async function recalculateTrustScore(userId: string): Promise<TrustScoreBreakdown> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, createdAt: true, profileImage: true },
  });
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "User not found");

  const counts = await collectFactorCounts(userId);
  const breakdown = computeTrustScore({
    ...counts,
    profileImagePresent: user.profileImage != null,
    accountAgeDays: ageInDays(user.createdAt),
  });

  await prisma.user.update({
    where: { id: userId },
    data: { trustScore: breakdown.score, trustScoreUpdatedAt: new Date() },
  });
  breakdown.updatedAt = new Date();
  return breakdown;
}