/**
 * Google Maps / Places / Geocoding helpers for ATHOO.
 *
 * All API calls go through the Google Maps Platform using the shared key.
 * Falls back gracefully to Expo Location if Google returns no results.
 */

const MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyAOVYRIgupAurZup5y1PRh8Ismb1A3lLao";

export interface PlaceSuggestion {
  placeId: string;
  label: string;
}

export interface PlaceCoords {
  lat: number;
  lng: number;
  formattedAddress: string;
}

// ─── Places Autocomplete ───────────────────────────────────────────────────────

/**
 * Search for Pakistani addresses using Google Places Autocomplete.
 * Returns up to 8 suggestions with placeId for detail lookup.
 */
export async function searchAddressGoogle(
  query: string,
): Promise<{ label: string; lat: number; lng: number }[]> {
  if (!query.trim() || query.length < 3) return [];
  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
      `?input=${encodeURIComponent(query)}` +
      `&key=${MAPS_API_KEY}` +
      `&components=country:pk` +
      `&language=en` +
      `&types=geocode`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      throw new Error(data.status);
    }

    const predictions: any[] = data.predictions || [];

    // Fetch coords for each prediction in parallel (up to 5)
    const top = predictions.slice(0, 5);
    const results = await Promise.all(
      top.map(async (p) => {
        try {
          const coords = await getPlaceCoords(p.place_id);
          return {
            label: p.description,
            lat: coords.lat,
            lng: coords.lng,
          };
        } catch {
          return null;
        }
      }),
    );

    return results.filter(Boolean) as { label: string; lat: number; lng: number }[];
  } catch {
    return [];
  }
}

/**
 * Get lat/lng for a Google Place ID.
 */
export async function getPlaceCoords(placeId: string): Promise<PlaceCoords> {
  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&key=${MAPS_API_KEY}` +
    `&fields=geometry,formatted_address`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== "OK") throw new Error(data.status);

  const loc = data.result.geometry.location;
  return {
    lat: loc.lat,
    lng: loc.lng,
    formattedAddress: data.result.formatted_address || "",
  };
}

// ─── Reverse Geocoding ────────────────────────────────────────────────────────

/**
 * Convert lat/lng to a human-readable Pakistani address using Google Geocoding.
 * Returns a concise 3–4 part address (neighbourhood, city, etc.).
 */
export async function reverseGeocodeGoogle(
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?latlng=${lat},${lng}` +
      `&key=${MAPS_API_KEY}` +
      `&language=en` +
      `&result_type=street_address|route|sublocality|locality`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "OK" || !data.results?.length) return null;

    // First result is the most precise — use formatted_address but trim Pakistan suffix
    const full: string = data.results[0].formatted_address || "";
    const parts = full
      .split(",")
      .map((p: string) => p.trim())
      .filter(Boolean);

    // Remove "Pakistan" from the end
    if (parts[parts.length - 1]?.toLowerCase() === "pakistan") parts.pop();

    // Keep up to 4 meaningful parts
    return parts.slice(0, 4).join(", ") || full;
  } catch {
    return null;
  }
}

// ─── Static Map URL ───────────────────────────────────────────────────────────

/**
 * Build a Google Static Map URL for embedding as an <Image> src.
 * Useful for thumbnails in list/card views.
 */
export function getStaticMapUrl(
  lat: number,
  lng: number,
  options: { zoom?: number; width?: number; height?: number; marker?: boolean } = {},
): string {
  const { zoom = 15, width = 400, height = 200, marker = true } = options;
  let url =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${lat},${lng}` +
    `&zoom=${zoom}` +
    `&size=${width}x${height}` +
    `&scale=2` +
    `&key=${MAPS_API_KEY}`;
  if (marker) {
    url += `&markers=color:blue%7C${lat},${lng}`;
  }
  return url;
}
