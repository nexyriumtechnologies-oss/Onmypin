import { ApiError } from "@/middleware/errorHandler";

/**
 * Indian states & UTs → two-letter codes.
 * Keyed by lowercase names (with common aliases) for forgiving matching.
 */
const STATE_CODES: Record<string, string> = {
  "andhra pradesh": "AP",
  "arunachal pradesh": "AR",
  assam: "AS",
  bihar: "BR",
  chhattisgarh: "CG",
  goa: "GA",
  gujarat: "GJ",
  haryana: "HR",
  "himachal pradesh": "HP",
  "jammu and kashmir": "JK",
  jharkhand: "JH",
  karnataka: "KA",
  kerala: "KL",
  "madhya pradesh": "MP",
  maharashtra: "MH",
  manipur: "MN",
  meghalaya: "ML",
  mizoram: "MZ",
  nagaland: "NL",
  odisha: "OD",
  orissa: "OD",
  punjab: "PB",
  rajasthan: "RJ",
  sikkim: "SK",
  "tamil nadu": "TN",
  telangana: "TS",
  tripura: "TR",
  "uttar pradesh": "UP",
  uttarakhand: "UK",
  "west bengal": "WB",
  "andaman and nicobar islands": "AN",
  "andaman and nicobar": "AN",
  chandigarh: "CH",
  "dadra and nagar haveli and daman and diu": "DD",
  "daman and diu": "DD",
  delhi: "DL",
  "national capital territory of delhi": "DL",
  ladakh: "LA",
  lakshadweep: "LD",
  puducherry: "PY",
  pondicherry: "PY",
};

export function getStateCode(state: string): string {
  const code = STATE_CODES[state.trim().toLowerCase()];
  if (!code) {
    throw new ApiError(
      400,
      "INVALID_STATE",
      `Unknown state: "${state}". Use a full state/UT name (e.g. "West Bengal")`,
    );
  }
  return code;
}
