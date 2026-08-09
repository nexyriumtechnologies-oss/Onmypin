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
}

/** Geocoding failure (network, no match) — not a user error. */
export class GeocodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocodeError";
  }
}

/**
 * OpenStreetMap Nominatim geocoder — free, keyless, 1 req/sec policy.
 * Primary provider for Phase 1; Google Maps can be registered later behind
 * the same Geocoder interface.
 */
export class NominatimGeocoder implements Geocoder {
  async geocode(address: string): Promise<GeocodeResult> {
    const q = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${q}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "ownmypin-backend/0.1.0 (dev)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      throw new GeocodeError(`Geocoder returned HTTP ${res.status}`);
    }
    const results = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    const best = results[0];
    if (!best) {
      throw new GeocodeError("No match for the given address");
    }
    return {
      latitude: Number.parseFloat(best.lat),
      longitude: Number.parseFloat(best.lon),
      formattedAddress: best.display_name,
      source: "osm",
    };
  }
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
