import { randomInt } from "node:crypto";
import { ApiError } from "@/middleware/errorHandler";
import { getDistrict } from "@/modules/districts/districts";

/**
 * DigiPin v1 codec — the code IS the payload (open encoding + checksum).
 *
 * Layout (18 chars, stored dashless; displayed `SS-DDD-XXXXXXXXXXXX-C`):
 *   SS   state shortform, 2 letters (existing stateCodes map)
 *   DDD  LGD district code, zero-padded decimal (3 chars, 1–796)
 *   body 12 Crockford-base32 chars = version:4 + lat:22 + lng:22 + rand:10
 *        (58 bits → 60-bit field, top 2 bits zero-pad)
 *   C    checksum char over the preceding 17 chars
 *
 * Coordinates are quantized to 1e-5° (~1.1 m, the phone-GPS noise floor) and
 * decode back grid-exactly. India-only box: lat 6–38, lng 68–98.
 * The 10-bit rand disambiguates stacked units at identical coords; the DB
 * @@unique on digipinNumber stays as the backstop (retry regenerates rand).
 */

// Crockford base32 — no I/L/O/U (no visual ambiguity), case-insensitive.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const VERSION = 1;
const VERSION_BITS = 4;
const LAT_BITS = 22;
const LNG_BITS = 22;
const RAND_BITS = 10;
const BODY_CHARS = 12;

const LAT_MIN = 6;
const LAT_MAX = 38;
const LNG_MIN = 68;
const LNG_MAX = 98;
const QUANTUM = 1e-5;

const LAT_Q_MAX = Math.round((LAT_MAX - LAT_MIN) / QUANTUM); // 3,200,000
const LNG_Q_MAX = Math.round((LNG_MAX - LNG_MIN) / QUANTUM); // 3,000,000

const LEGACY_FORMAT = /^[A-Z]{2}\d{6}$/;

function toBase32(value: bigint, chars: number): string {
  let out = "";
  let n = value;
  for (let i = 0; i < chars; i++) {
    // Index is always 0–31 by masking; the `!` satisfies noUncheckedIndexedAccess.
    out = ALPHABET[Number(n & 31n)]! + out;
    n >>= 5n;
  }
  if (n !== 0n) throw new Error("toBase32 overflow: value exceeds field width");
  return out;
}

function fromBase32(body: string): bigint {
  let n = 0n;
  for (const ch of body) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) {
      throw new ApiError(400, "INVALID_DIGIPIN_FORMAT", `Invalid character in DigiPin: "${ch}"`);
    }
    n = (n << 5n) | BigInt(v);
  }
  return n;
}

/** FNV-1a 32-bit, mod 32 → checksum char. Catches typos/transcription errors. */
function checksumChar(prefix17: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < prefix17.length; i++) {
    hash ^= prefix17.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ALPHABET[(hash >>> 0) % 32]!;
}

/** Encode inputs — version is fixed by the codec, callers never pass it. */
export interface DigiPinPayload {
  stateShort: string;
  districtCode: number;
  latitude: number;
  longitude: number;
}

export interface DecodedDigiPin extends DigiPinPayload {
  version: number;
  districtName: string;
  stateName: string;
}

/** Old-format code (2 letters + 6 digits) — decode does not apply; still gated the same way. */
export function isLegacyDigiPin(code: string): boolean {
  return LEGACY_FORMAT.test(code.replace(/[\s-]/g, "").toUpperCase());
}

/** Display form: SS-DDD-XXXXXXXXXXXX-C. Storage stays dashless. */
export function formatDigiPin(stored: string): string {
  const c = stored.replace(/[\s-]/g, "").toUpperCase();
  return `${c.slice(0, 2)}-${c.slice(2, 5)}-${c.slice(5, 17)}-${c.slice(17)}`;
}

export function encodeDigiPin(input: DigiPinPayload): string {
  const stateShort = input.stateShort.toUpperCase();
  if (!/^[A-Z]{2}$/.test(stateShort)) {
    throw new ApiError(400, "INVALID_STATE", `Invalid state shortform: "${input.stateShort}"`);
  }
  // Validates code exists AND belongs to this state.
  const district = getDistrict(input.districtCode);
  if (district.stateShort !== stateShort) {
    throw new ApiError(
      400,
      "DISTRICT_STATE_MISMATCH",
      `District ${district.name} (${district.code}) belongs to ${district.stateShort}, not ${stateShort}.`,
    );
  }

  const latQ = Math.round((input.latitude - LAT_MIN) / QUANTUM);
  const lngQ = Math.round((input.longitude - LNG_MIN) / QUANTUM);
  if (
    !Number.isFinite(latQ) ||
    !Number.isFinite(lngQ) ||
    latQ < 0 ||
    latQ > LAT_Q_MAX ||
    lngQ < 0 ||
    lngQ > LNG_Q_MAX
  ) {
    throw new ApiError(
      400,
      "DIGIPIN_OUT_OF_RANGE",
      "Coordinates outside the supported India grid (lat 6–38, lng 68–98).",
    );
  }

  const rand = randomInt(0, 1 << RAND_BITS);
  const packed =
    (BigInt(VERSION) << BigInt(LAT_BITS + LNG_BITS + RAND_BITS)) |
    (BigInt(latQ) << BigInt(LNG_BITS + RAND_BITS)) |
    (BigInt(lngQ) << BigInt(RAND_BITS)) |
    BigInt(rand);
  const body = toBase32(packed, BODY_CHARS);
  const head17 = `${stateShort}${String(district.code).padStart(3, "0")}${body}`;
  return head17 + checksumChar(head17);
}

export function decodeDigiPin(code: string): DecodedDigiPin {
  const clean = code.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{3}[0-9A-HJKMNP-TV-Z]{13}$/.test(clean)) {
    throw new ApiError(
      400,
      "INVALID_DIGIPIN_FORMAT",
      "DigiPin must be SS + 3-digit district code + 13 code characters.",
    );
  }
  const stateShort = clean.slice(0, 2);
  const districtCode = parseInt(clean.slice(2, 5), 10);
  const body = clean.slice(5, 17);
  if (checksumChar(clean.slice(0, 17)) !== clean[17]) {
    throw new ApiError(400, "DIGIPIN_CHECKSUM_MISMATCH", "DigiPin checksum failed — check for typos.");
  }

  const packed = fromBase32(body);
  const version = Number((packed >> BigInt(LAT_BITS + LNG_BITS + RAND_BITS)) & 15n);
  if (version !== VERSION) {
    throw new ApiError(400, "UNSUPPORTED_DIGIPIN_VERSION", `Unsupported DigiPin version: ${version}`);
  }
  const latQ = Number((packed >> BigInt(LNG_BITS + RAND_BITS)) & ((1n << BigInt(LAT_BITS)) - 1n));
  const lngQ = Number((packed >> BigInt(RAND_BITS)) & ((1n << BigInt(LNG_BITS)) - 1n));

  const district = getDistrict(districtCode);
  if (district.stateShort !== stateShort) {
    throw new ApiError(400, "DIGIPIN_CHECKSUM_MISMATCH", "DigiPin state/district mismatch.");
  }

  // Grid-exact round-trip: quantize the float output back to the 1e-5 grid.
  const latitude = Math.round((LAT_MIN + latQ * QUANTUM) * 1e5) / 1e5;
  const longitude = Math.round((LNG_MIN + lngQ * QUANTUM) * 1e5) / 1e5;
  return {
    version,
    stateShort,
    districtCode,
    districtName: district.name,
    stateName: district.stateName,
    latitude,
    longitude,
  };
}
