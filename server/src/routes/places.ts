import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { db, type PlaceRow, type StampRow } from '../db.js';
import { currentUser, requireAuth } from '../auth.js';
import { COLLECT_RADIUS_M, PHOTO_RADIUS_M, haversineMeters } from '../geo.js';
import { geocode } from '../geocode.js';
import { LANDMARK_CHECK_ENABLED, verifyLandmarkPhoto } from '../landmark.js';

export const placesRouter = Router();
placesRouter.use(requireAuth);

function serializeStamp(stamp: StampRow) {
  return {
    id: stamp.id,
    placeId: stamp.place_id,
    collectedAt: stamp.collected_at,
    distanceM: stamp.distance_m,
    photoUrl: stamp.photo_updated_at
      ? `/api/places/${stamp.place_id}/photo?v=${encodeURIComponent(stamp.photo_updated_at)}`
      : null,
  };
}

function serializePlace(place: PlaceRow, stamp: StampRow | null) {
  return {
    id: place.id,
    name: place.name,
    country: place.country,
    description: place.description,
    lat: place.lat,
    lng: place.lng,
    isCurated: place.is_curated === 1,
    isMine: place.created_by !== null,
    artKey: place.art_key,
    category: place.category,
    state: place.state,
    createdAt: place.created_at,
    stamp: stamp ? serializeStamp(stamp) : null,
  };
}

// A place is visible to a user if it's curated or their own custom place.
function visiblePlace(placeId: string, userId: number): PlaceRow | undefined {
  return db
    .prepare(
      'SELECT * FROM places WHERE id = ? AND (is_curated = 1 OR created_by = ?)',
    )
    .get(placeId, userId) as PlaceRow | undefined;
}

function stampFor(placeId: string, userId: number): StampRow | null {
  const row = db
    .prepare('SELECT * FROM stamps WHERE place_id = ? AND user_id = ?')
    .get(placeId, userId) as StampRow | undefined;
  return row ?? null;
}

const PHOTO_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

function decodePhoto(photo: unknown): { buffer: Buffer; mime: string } | null {
  const match = typeof photo === 'string' && photo.match(PHOTO_DATA_URL);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 4 * 1024 * 1024) return null;
  return { buffer, mime: `image/${match[1]}` };
}

function insertStamp(
  userId: number,
  placeId: string,
  coords: { lat: number; lng: number } | null,
  distanceM: number | null,
  photo: { buffer: Buffer; mime: string } | null,
): StampRow {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO stamps (id, user_id, place_id, collected_lat, collected_lng, distance_m,
                         photo, photo_mime, photo_updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${photo ? "datetime('now')" : 'NULL'})`,
  ).run(
    id,
    userId,
    placeId,
    coords?.lat ?? null,
    coords?.lng ?? null,
    distanceM,
    photo?.buffer ?? null,
    photo?.mime ?? null,
  );
  return db.prepare('SELECT * FROM stamps WHERE id = ?').get(id) as StampRow;
}

placesRouter.get('/', (_req, res) => {
  const user = currentUser(res);
  const places = db
    .prepare(
      `SELECT * FROM places WHERE is_curated = 1 OR created_by = ?
       ORDER BY is_curated DESC, name`,
    )
    .all(user.id) as PlaceRow[];
  res.json({
    places: places.map((p) => serializePlace(p, stampFor(p.id, user.id))),
  });
});

const normalizeSearchText = (value: string) =>
  value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('en');

placesRouter.post('/geocode', async (req, res) => {
  const { name, location, country, hasPhotoGps } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
    res.status(400).json({ error: 'INVALID_NAME' });
    return;
  }
  if (
    typeof location !== 'string' ||
    location.trim().length > 120 ||
    typeof country !== 'string' ||
    !country.trim() ||
    country.trim().length > 60
  ) {
    res.status(400).json({ error: 'INVALID_LOCATION_QUERY' });
    return;
  }

  const normalizedCountry = normalizeSearchText(country);
  const normalizedName = normalizeSearchText(name);
  const normalizedLocation = normalizeSearchText(location);
  const curated = db
    .prepare('SELECT * FROM places WHERE is_curated = 1')
    .all() as PlaceRow[];
  const findCatalogMatch = (hint: string) =>
    curated.find((place) => {
      if (!hint || normalizeSearchText(place.country) !== normalizedCountry) return false;
      return [place.name, place.state]
        .filter((value): value is string => typeof value === 'string')
        .map((value) => normalizeSearchText(value))
        .some(
          (searchable) =>
            hint === searchable || (searchable.length >= 4 && hint.includes(searchable)),
        );
    });
  const catalogNameMatch = findCatalogMatch(normalizedName);
  // With photo GPS, a city/region catalog point is enough to confirm the
  // surrounding area. Without it, resolve the complete query so a named venue
  // is not silently stored at the city center.
  const catalogMatch =
    catalogNameMatch ?? (hasPhotoGps === true ? findCatalogMatch(normalizedLocation) : undefined);
  if (catalogMatch) {
    // A city or state used only as the location hint confirms where a custom
    // point is, but does not turn a cafe, trailhead, or other venue into that
    // broader category. The custom name itself must identify the city/state.
    const category = catalogNameMatch?.category ?? 'landmark';
    res.json({
      location: {
        lat: catalogMatch.lat,
        lng: catalogMatch.lng,
        label: `${catalogMatch.name}, ${catalogMatch.country}`,
        source: 'catalog',
        category,
        stateName: category === 'us-state' ? catalogMatch.state : null,
        bounds: null,
      },
    });
    return;
  }

  const query = [name.trim(), location.trim(), country.trim()].filter(Boolean).join(', ');
  try {
    const match = await geocode(query);
    if (!match) {
      res.status(404).json({ error: 'LOCATION_NOT_FOUND' });
      return;
    }
    res.json({ location: match });
  } catch (error) {
    console.error('Place geocoding failed', error);
    res.status(502).json({ error: 'GEOCODER_UNAVAILABLE' });
  }
});

placesRouter.post('/', (req, res) => {
  const user = currentUser(res);
  const { name, country, description, lat, lng, category, state } = (req.body ?? {}) as Record<
    string,
    unknown
  >;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
    res.status(400).json({ error: 'INVALID_NAME' });
    return;
  }
  if (typeof country !== 'string' || !country.trim() || country.trim().length > 60) {
    res.status(400).json({ error: 'INVALID_COUNTRY' });
    return;
  }
  if (
    typeof lat !== 'number' || typeof lng !== 'number' ||
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    lat < -90 || lat > 90 || lng < -180 || lng > 180
  ) {
    res.status(400).json({ error: 'INVALID_COORDINATES' });
    return;
  }
  const placeCategory = category === undefined ? 'landmark' : category;
  if (
    placeCategory !== 'landmark' &&
    placeCategory !== 'city' &&
    placeCategory !== 'us-state'
  ) {
    res.status(400).json({ error: 'INVALID_CATEGORY' });
    return;
  }
  const desc = typeof description === 'string' ? description.trim().slice(0, 400) : '';
  const stateName =
    placeCategory === 'us-state'
      ? typeof state === 'string' && state.trim()
        ? state.trim().slice(0, 60)
        : name.trim().slice(0, 60)
      : null;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO places
       (id, name, country, description, lat, lng, is_curated, created_by, category, state)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
  ).run(id, name.trim(), country.trim(), desc, lat, lng, user.id, placeCategory, stateName);
  const place = db.prepare('SELECT * FROM places WHERE id = ?').get(id) as PlaceRow;
  res.status(201).json({ place: serializePlace(place, null) });
});

placesRouter.get('/:id', (req, res) => {
  const user = currentUser(res);
  const place = visiblePlace(req.params.id, user.id);
  if (!place) {
    res.status(404).json({ error: 'PLACE_NOT_FOUND' });
    return;
  }
  res.json({ place: serializePlace(place, stampFor(place.id, user.id)) });
});

placesRouter.delete('/:id', (req, res) => {
  const user = currentUser(res);
  const info = db
    .prepare('DELETE FROM places WHERE id = ? AND created_by = ? AND is_curated = 0')
    .run(req.params.id, user.id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'PLACE_NOT_FOUND' });
    return;
  }
  res.json({ ok: true });
});

// A personal photo replaces the built-in illustration as the stamp art.
placesRouter.put('/:id/photo', (req, res) => {
  const user = currentUser(res);
  const place = visiblePlace(req.params.id, user.id);
  if (!place) {
    res.status(404).json({ error: 'PLACE_NOT_FOUND' });
    return;
  }
  const stamp = stampFor(place.id, user.id);
  if (!stamp) {
    res.status(409).json({ error: 'NOT_COLLECTED' });
    return;
  }
  const { photo } = (req.body ?? {}) as Record<string, unknown>;
  const match =
    typeof photo === 'string' && photo.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    res.status(400).json({ error: 'INVALID_PHOTO' });
    return;
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 4 * 1024 * 1024) {
    res.status(413).json({ error: 'PHOTO_TOO_LARGE' });
    return;
  }
  db.prepare(
    `UPDATE stamps SET photo = ?, photo_mime = ?, photo_updated_at = datetime('now') WHERE id = ?`,
  ).run(buffer, `image/${match[1]}`, stamp.id);
  const updated = db.prepare('SELECT * FROM stamps WHERE id = ?').get(stamp.id) as StampRow;
  res.json({ stamp: serializeStamp(updated) });
});

placesRouter.get('/:id/photo', (req, res) => {
  const user = currentUser(res);
  const stamp = stampFor(req.params.id, user.id);
  if (!stamp || !stamp.photo || !stamp.photo_mime) {
    res.status(404).json({ error: 'PHOTO_NOT_FOUND' });
    return;
  }
  res.setHeader('Content-Type', stamp.photo_mime);
  // URLs carry a ?v= cache-buster from photo_updated_at, so long caching is safe.
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(stamp.photo);
});

placesRouter.post('/:id/collect', (req, res) => {
  const user = currentUser(res);
  const place = visiblePlace(req.params.id, user.id);
  if (!place) {
    res.status(404).json({ error: 'PLACE_NOT_FOUND' });
    return;
  }
  const { lat, lng } = (req.body ?? {}) as Record<string, unknown>;
  if (
    typeof lat !== 'number' || typeof lng !== 'number' ||
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    lat < -90 || lat > 90 || lng < -180 || lng > 180
  ) {
    res.status(400).json({ error: 'INVALID_COORDINATES' });
    return;
  }
  // Authoritative proximity check — the client-side gate is cosmetic.
  const distanceM = haversineMeters(lat, lng, place.lat, place.lng);
  if (distanceM > COLLECT_RADIUS_M) {
    res.status(403).json({ error: 'TOO_FAR', distanceM: Math.round(distanceM) });
    return;
  }
  if (stampFor(place.id, user.id)) {
    res.status(409).json({ error: 'ALREADY_COLLECTED' });
    return;
  }
  const stamp = insertStamp(user.id, place.id, { lat, lng }, distanceM, null);
  res.status(201).json({ stamp: serializeStamp(stamp) });
});

// Remote collection with photo evidence. Two verification paths:
// 1. The photo's EXIF GPS (extracted client-side, same trust level as browser
//    geolocation) is within PHOTO_RADIUS_M of the place.
// 2. Otherwise, if a Gemini or Hugging Face provider is configured, a vision
//    check confirms the photo actually shows this place's landmark.
// Either way the photo becomes the stamp art.
placesRouter.post('/:id/collect-photo', async (req, res) => {
  const user = currentUser(res);
  const place = visiblePlace(req.params.id, user.id);
  if (!place) {
    res.status(404).json({ error: 'PLACE_NOT_FOUND' });
    return;
  }
  if (stampFor(place.id, user.id)) {
    res.status(409).json({ error: 'ALREADY_COLLECTED' });
    return;
  }
  const { photo, photoLat, photoLng } = (req.body ?? {}) as Record<string, unknown>;
  const decoded = decodePhoto(photo);
  if (!decoded) {
    res.status(400).json({ error: 'INVALID_PHOTO' });
    return;
  }

  const gps =
    typeof photoLat === 'number' && typeof photoLng === 'number' &&
    Number.isFinite(photoLat) && Number.isFinite(photoLng) &&
    Math.abs(photoLat) <= 90 && Math.abs(photoLng) <= 180
      ? { lat: photoLat, lng: photoLng }
      : null;

  let gpsDistanceM: number | null = null;
  if (gps) {
    gpsDistanceM = haversineMeters(gps.lat, gps.lng, place.lat, place.lng);
    if (gpsDistanceM <= PHOTO_RADIUS_M) {
      const stamp = insertStamp(user.id, place.id, gps, gpsDistanceM, decoded);
      res.status(201).json({ stamp: serializeStamp(stamp), verifiedBy: 'photo-gps' });
      return;
    }
  }

  if (LANDMARK_CHECK_ENABLED) {
    let verdict;
    try {
      verdict = await verifyLandmarkPhoto(place.name, place.country, photo as string);
    } catch {
      res.status(503).json({ error: 'VERIFICATION_UNAVAILABLE' });
      return;
    }
    if (verdict.match && verdict.confidence !== 'low') {
      const stamp = insertStamp(user.id, place.id, null, null, decoded);
      res.status(201).json({ stamp: serializeStamp(stamp), verifiedBy: 'photo-landmark' });
      return;
    }
    if (!gps) {
      res.status(403).json({ error: 'PHOTO_NOT_RECOGNIZED', reason: verdict.reason });
      return;
    }
  }

  if (gpsDistanceM !== null) {
    res.status(403).json({ error: 'PHOTO_TOO_FAR', distanceM: Math.round(gpsDistanceM) });
  } else {
    res.status(403).json({
      error: 'PHOTO_NO_LOCATION',
      landmarkCheckAvailable: LANDMARK_CHECK_ENABLED,
    });
  }
});
