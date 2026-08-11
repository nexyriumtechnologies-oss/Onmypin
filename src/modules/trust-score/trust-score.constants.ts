/**
 * Trust Score rule table — single source of truth for how a user's trust score
 * is derived. Every factor, cap and penalty lives here so the numbers can be
 * tuned without touching logic. Updated scores are persisted only by
 * `recalculateTrustScore` (called from the admin verification routes, Module 7);
 * there is no client-settable path.
 */

export const TRUST_SCORE_MAX = 100;
export const TRUST_SCORE_FLOOR = 0;

export type TrustFactorUnit = "count" | "flag" | "band";

export interface TrustFactorRule {
  code: string;
  label: string;
  unit: TrustFactorUnit;
  points: number; // per unit earned (count/flag), or the band top value (band)
  maxUnits: number; // cap on how many units are counted
  description: string;
}

/** Positive factors. ACCOUNT_AGE earns via ACCOUNT_AGE_BANDS (points = top value). */
export const TRUST_FACTOR_RULES: TrustFactorRule[] = [
  {
    code: "VERIFIED_PROPERTY",
    label: "Verified property",
    unit: "count",
    points: 15,
    maxUnits: 3,
    description: "Each property verified by the platform",
  },
  {
    code: "VERIFIED_BUSINESS",
    label: "Verified business",
    unit: "count",
    points: 20,
    maxUnits: 2,
    description: "Each business verified by the platform",
  },
  {
    code: "BUSINESS_IMAGES",
    label: "Business photos",
    unit: "count",
    points: 5,
    maxUnits: 2,
    description: "Each verified business with at least one photo",
  },
  {
    code: "SELFIE_UPLOADED",
    label: "Identity selfie",
    unit: "flag",
    points: 10,
    maxUnits: 1,
    description: "Submitted a verification selfie",
  },
  {
    code: "PROFILE_IMAGE",
    label: "Profile photo",
    unit: "flag",
    points: 5,
    maxUnits: 1,
    description: "Has a profile photo",
  },
  {
    code: "ACCOUNT_AGE",
    label: "Account age",
    unit: "band",
    points: 20,
    maxUnits: 1,
    description: "Long-standing accounts build trust",
  },
];

/** Account age bands, highest matching band wins. Points mirror rule.points at top. */
export const ACCOUNT_AGE_BANDS = [
  { minDays: 365, points: 20 },
  { minDays: 180, points: 15 },
  { minDays: 90, points: 10 },
  { minDays: 30, points: 5 },
] as const;

/** Penalties — applied while the rejection is unresolved (admin reject, Module 7). */
export const TRUST_PENALTY_RULES: TrustFactorRule[] = [
  {
    code: "REJECTED_PROPERTY",
    label: "Property verification rejected",
    unit: "count",
    points: -10,
    maxUnits: 2,
    description: "Each currently-rejected property",
  },
  {
    code: "REJECTED_BUSINESS",
    label: "Business verification rejected",
    unit: "count",
    points: -10,
    maxUnits: 2,
    description: "Each currently-rejected business",
  },
];