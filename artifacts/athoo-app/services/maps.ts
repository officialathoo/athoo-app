/**
 * Google Maps / Places / Geocoding helpers for ATHOO.
 *
 * All API calls go through the Google Maps Platform using the shared key.
 * Falls back gracefully to Expo Location if Google returns no results.
 */

const MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";

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

// ─── Directions / Route ───────────────────────────────────────────────────────

export interface DirectionsResult {
  distanceKm: number;
  durationMin: number;
  polyline: string; // encoded polyline for MapView rendering
  summary: string;
}

/**
 * Get real road directions between two points via Google Directions API.
 * Returns distance, ETA, and an encoded polyline for map rendering.
 */
export async function getDirections(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<DirectionsResult | null> {
  if (!MAPS_API_KEY) return null;
  try {
    const url =
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${originLat},${originLng}` +
      `&destination=${destLat},${destLng}` +
      `&key=${MAPS_API_KEY}` +
      `&mode=driving` +
      `&language=en` +
      `&region=pk`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "OK" || !data.routes?.length) return null;

    const route = data.routes[0];
    const leg = route.legs[0];

    return {
      distanceKm: Math.round((leg.distance.value / 1000) * 10) / 10,
      durationMin: Math.ceil(leg.duration.value / 60),
      polyline: route.overview_polyline?.points || "",
      summary: route.summary || "",
    };
  } catch {
    return null;
  }
}

/**
 * Decode a Google Maps encoded polyline into an array of {latitude, longitude}
 * coordinates for rendering on react-native-maps.
 */
export function decodePolyline(
  encoded: string,
): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
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
