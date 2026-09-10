/** Google Maps deep links. Coordinates are never shown; they only shape URLs. */

/** Exact pin when coordinates exist, readable-name search otherwise. */
export function googleMapsUrl(
  location: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
): string | null {
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  const name = location?.trim();
  if (name) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
  }
  return null;
}
