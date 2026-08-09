import { ApiError } from "@/middleware/errorHandler";

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  source: string;
}

/** Geocodes a free-text address into coordinates. */
export interface Geocoder {
  geocode(address: string): Promise<GeocodeResult>;
  /** Resolves coordinates back to a place name (null when unsupported). */
  reverseGeocode(latitude: number, longitude: number): Promise<string | null>;
}

/** Geocoding failure (network, no match) — not a user error. */
export class GeocodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocodeError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Serializes every geocode request and enforces a minimum spacing between
 * calls. Nominatim's usage policy allows ~1 req/sec from one IP — without
 * this, rapid requests (e.g. verify + submit in one screen flow) get HTTP 429
 * and surface as 502 GEOCODE_FAILED.
 */
let lastRequestAt = 0;
const MIN_REQUEST_GAP_MS = 1200;
let queue = Promise.resolve();
function throttleGeocode<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = Math.max(0, lastRequestAt + MIN_REQUEST_GAP_MS - Date.now());
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return fn();
  });
  queue = run.then(() => undefined, () => undefined);
  return run;
}

/**
 * OpenStreetMap Nominatim geocoder — free, keyless, 1 req/sec policy.
 * Primary provider for Phase 1; Google Maps can be registered later behind
 * the same Geocoder interface.
 */
export class NominatimGeocoder implements Geocoder {
  private async query(q: string): Promise<GeocodeResult> {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "ownmypin-backend/0.1.0 (dev)" },
      signal: AbortSignal.timeout(8000),
    });

    // 429 (rate limit) and 5xx (server-side) are transient — retry with
    // backoff instead of failing the user's request.
    if (res.status === 429 || res.status >= 500) {
      throw new GeocodeRetryableError(`Geocoder returned HTTP ${res.status}`);
    }
    if (!res.ok) {
      throw new GeocodeError(`Geocoder returned HTTP ${res.status}`);
    }
    const results = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    const best = results[0];
    if (!best) {
      throw new GeocodeError(`No match for "${q}"`);
    }
    return {
      latitude: Number.parseFloat(best.lat),
      longitude: Number.parseFloat(best.lon),
      formattedAddress: best.display_name,
      source: "osm",
    };
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
    return throttleGeocode(async () => {
      const url =
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${latitude}&lon=${longitude}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "ownmypin-backend/0.1.0 (dev)" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { display_name?: string };
      return j.display_name ?? null;
    });
  }

  async geocode(address: string): Promise<GeocodeResult> {
    // Progressive fallbacks: a full "house number, street, locality" line often
    // fails on OSM when one part is unknown — retry with simpler queries.
    const queries = buildFallbackQueries(address);

    let lastError: GeocodeError | null = null;
    for (const q of queries) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await throttleGeocode(() => this.query(q));
        } catch (err) {
          if (err instanceof GeocodeRetryableError) {
            lastError = new GeocodeError(err.message);
            await sleep(1500 * (attempt + 1)); // backoff before retry
            continue;
          }
          lastError = err as GeocodeError;
          break; // hard failure — try the next simpler query
        }
      }
    }
    throw lastError ?? new GeocodeError(`No match for "${address}"`);
  }
}

/** Retryable geocoder failure (rate limit / upstream 5xx). */
class GeocodeRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocodeRetryableError";
  }
}

/**
 * Query ladder for tolerant matching, e.g.
 * "14 Park Street, Ballygunge, Kolkata, West Bengal 700016" →
 *  1. full line
 *  2. without the pincode
 *  3. without pincode and the house number
 *  4. locality + city + state
 */
export function buildFallbackQueries(address: string): string[] {
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return [address];

  const withoutPincode = parts.filter((p) => !/^\d{6}$/.test(p.replace(/[^0-9]/g, "")));
  const withoutHouseNumber = withoutPincode.filter((p, i) => {
    if (i !== 0) return true;
    return !/^\d+\s/.test(p) && !/^[#]?\d+$/.test(p);
  });
  const localityUp = withoutHouseNumber.length >= 2 ? withoutHouseNumber.slice(-2) : withoutHouseNumber;

  return [
    parts.join(", "),
    withoutPincode.join(", "),
    withoutHouseNumber.join(", "),
    localityUp.join(", "),
  ].filter((q, i, arr) => q && arr.indexOf(q) === i);
}

/**
 * Mock implementation: fixed coordinates (New Delhi), no network needed.
 * Keeps dev/tests offline-safe — set LOCATION_PROVIDER=osm for real lookups.
 */
export class MockGeocoder implements Geocoder {
  async geocode(address: string): Promise<GeocodeResult> {
    return {
      latitude: 28.6139,
      longitude: 77.209,
      formattedAddress: address,
      source: "mock",
    };
  }

  async reverseGeocode(): Promise<string | null> {
    return null;
  }
}

export function getGeocoder(): Geocoder {
  const name = process.env.LOCATION_PROVIDER ?? "mock";
  switch (name) {
    case "mock":
      return new MockGeocoder();
    case "osm":
    case "nominatim":
      return new NominatimGeocoder();
    default:
      throw new ApiError(
        501,
        "LOCATION_PROVIDER_NOT_CONFIGURED",
        `Location provider "${name}" is not implemented yet`,
      );
  }
}
