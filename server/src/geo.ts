// Authoritative collection radius. The client mirrors this value in
// client/src/lib/geo.ts purely to gate the Collect button — the server
// check here is what actually protects the data.
export const COLLECT_RADIUS_M = 500;

// Radius for collecting via a photo's EXIF location. More generous than the
// live-GPS radius: landmark photos are usually taken from a viewpoint some
// distance away (Trocadéro, Sugarloaf, the rim of the caldera).
// Ten statute miles, expressed in meters for all distance calculations.
export const PHOTO_RADIUS_M = 16093.44;

const EARTH_RADIUS_M = 6371000;

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}
