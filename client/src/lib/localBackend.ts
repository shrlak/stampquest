// Browser-only backend for the static build (GitHub Pages demo mode).
// Mirrors the REST API's paths and responses so the rest of the app is
// unchanged; data lives in localStorage on this device. Selected at build
// time via VITE_BACKEND=local (see api.ts).
import { COLLECT_RADIUS_M, PHOTO_RADIUS_M, haversineMeters } from './geo';
import { idbClear, idbDelete, idbGet, idbSet } from './idb';
import { SEED_PLACES } from '../data/seedPlaces';
import type { Place, Stamp, Stats, User } from '../types';

const KEYS = {
  profile: 'stampquest.profile',
  stamps: 'stampquest.stamps',
  places: 'stampquest.customPlaces',
};

// The profile photo itself lives in IndexedDB (same store as stamp photos),
// keyed separately from any place id.
const PROFILE_PHOTO_KEY = 'stampquest.profile-photo';

interface CustomPlace {
  id: string;
  name: string;
  country: string;
  description: string;
  lat: number;
  lng: number;
  createdAt: string;
}

interface LocalResult {
  status: number;
  data: unknown;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function profile(): Omit<User, 'photoUrl'> {
  let user = load<Omit<User, 'photoUrl'> | null>(KEYS.profile, null);
  if (!user) {
    user = {
      id: 1,
      username: 'traveler',
      createdAt: new Date().toISOString(),
    };
    store(KEYS.profile, user);
  }
  return user;
}

const stamps = () => load<Record<string, Stamp>>(KEYS.stamps, {});
const customPlaces = () => load<CustomPlace[]>(KEYS.places, []);

function toPlace(seedOrCustom: (typeof SEED_PLACES)[number] | CustomPlace, curated: boolean): Place {
  return {
    id: seedOrCustom.id,
    name: seedOrCustom.name,
    country: seedOrCustom.country,
    description: seedOrCustom.description,
    lat: seedOrCustom.lat,
    lng: seedOrCustom.lng,
    isCurated: curated,
    isMine: !curated,
    artKey: curated ? (seedOrCustom as (typeof SEED_PLACES)[number]).artKey : null,
    // custom places default to 'landmark', same as the real server
    category: curated ? (seedOrCustom as (typeof SEED_PLACES)[number]).category : 'landmark',
    createdAt: curated ? '' : (seedOrCustom as CustomPlace).createdAt,
    stamp: stamps()[seedOrCustom.id] ?? null,
  };
}

// Photos live in IndexedDB (localStorage's quota is too small for pictures);
// in this mode photoUrl is the data URL itself.
async function withPhoto(place: Place): Promise<Place> {
  if (!place.stamp) return place;
  const photo = await idbGet(place.id);
  return photo ? { ...place, stamp: { ...place.stamp, photoUrl: photo } } : place;
}

async function allPlaces(): Promise<Place[]> {
  const bare = [
    ...SEED_PLACES.map((s) => toPlace(s, true)),
    ...customPlaces().map((c) => toPlace(c, false)),
  ];
  return Promise.all(bare.map(withPhoto));
}

function stats(): Stats {
  const collected = Object.keys(stamps());
  const byId = new Map(
    [...SEED_PLACES, ...customPlaces()].map((p) => [p.id, p.country] as const),
  );
  return {
    stampCount: collected.length,
    countryCount: new Set(collected.map((id) => byId.get(id)).filter(Boolean)).size,
  };
}

async function me(): Promise<LocalResult> {
  const photoUrl = (await idbGet(PROFILE_PHOTO_KEY)) ?? null;
  return { status: 200, data: { user: { ...profile(), photoUrl }, stats: stats() } };
}

const ok = (data: unknown, status = 200): LocalResult => ({ status, data });
const fail = (status: number, error: string, extra?: Record<string, unknown>): LocalResult => ({
  status,
  data: { error, ...extra },
});

/** Clears everything this device knows — used by the demo-mode reset. */
export function resetLocalData(): void {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  void idbClear();
}

export async function localRequest(
  path: string,
  method: string,
  body: unknown,
): Promise<LocalResult> {
  const b = (body ?? {}) as Record<string, unknown>;

  if (path === '/api/auth/me' || path === '/api/auth/register' || path === '/api/auth/login') {
    return me();
  }
  if (path === '/api/auth/logout') return ok({ ok: true });

  if (path === '/api/auth/me/photo' && method === 'PUT') {
    const dataUrl = b.photo;
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return fail(400, 'INVALID_PHOTO');
    }
    await idbSet(PROFILE_PHOTO_KEY, dataUrl);
    return ok({ user: { ...profile(), photoUrl: dataUrl } });
  }

  if (path === '/api/places' && method === 'GET') return ok({ places: await allPlaces() });

  if (path === '/api/places' && method === 'POST') {
    const { name, country, description, lat, lng } = b;
    if (typeof name !== 'string' || !name.trim()) return fail(400, 'INVALID_NAME');
    if (typeof country !== 'string' || !country.trim()) return fail(400, 'INVALID_COUNTRY');
    if (
      typeof lat !== 'number' || typeof lng !== 'number' ||
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      Math.abs(lat) > 90 || Math.abs(lng) > 180
    ) {
      return fail(400, 'INVALID_COORDINATES');
    }
    const place: CustomPlace = {
      id: crypto.randomUUID(),
      name: name.trim().slice(0, 80),
      country: country.trim().slice(0, 60),
      description: typeof description === 'string' ? description.trim().slice(0, 400) : '',
      lat,
      lng,
      createdAt: new Date().toISOString(),
    };
    store(KEYS.places, [...customPlaces(), place]);
    return ok({ place: toPlace(place, false) }, 201);
  }

  const detail = path.match(/^\/api\/places\/([^/]+)$/);
  if (detail) {
    const place = (await allPlaces()).find((p) => p.id === detail[1]);
    if (!place) return fail(404, 'PLACE_NOT_FOUND');
    if (method === 'GET') return ok({ place });
    if (method === 'DELETE') {
      if (place.isCurated) return fail(404, 'PLACE_NOT_FOUND');
      store(KEYS.places, customPlaces().filter((p) => p.id !== place.id));
      const s = stamps();
      delete s[place.id];
      store(KEYS.stamps, s);
      await idbDelete(place.id);
      return ok({ ok: true });
    }
  }

  const photo = path.match(/^\/api\/places\/([^/]+)\/photo$/);
  if (photo && method === 'PUT') {
    const s = stamps();
    if (!s[photo[1]]) return fail(409, 'NOT_COLLECTED');
    const dataUrl = b.photo;
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return fail(400, 'INVALID_PHOTO');
    }
    await idbSet(photo[1], dataUrl);
    return ok({ stamp: { ...s[photo[1]], photoUrl: dataUrl } });
  }

  // Photo-evidence collection: EXIF GPS only in demo mode (the landmark
  // vision check needs a server, which the static build doesn't have).
  const collectPhoto = path.match(/^\/api\/places\/([^/]+)\/collect-photo$/);
  if (collectPhoto && method === 'POST') {
    const place = (await allPlaces()).find((p) => p.id === collectPhoto[1]);
    if (!place) return fail(404, 'PLACE_NOT_FOUND');
    const s = stamps();
    if (s[place.id]) return fail(409, 'ALREADY_COLLECTED');
    const dataUrl = b.photo;
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return fail(400, 'INVALID_PHOTO');
    }
    const { photoLat, photoLng } = b;
    if (typeof photoLat !== 'number' || typeof photoLng !== 'number') {
      return fail(403, 'PHOTO_NO_LOCATION', { landmarkCheckAvailable: false });
    }
    const distanceM = haversineMeters(photoLat, photoLng, place.lat, place.lng);
    if (distanceM > PHOTO_RADIUS_M) {
      return fail(403, 'PHOTO_TOO_FAR', { distanceM: Math.round(distanceM) });
    }
    const stamp: Stamp = {
      id: crypto.randomUUID(),
      placeId: place.id,
      collectedAt: new Date().toISOString(),
      distanceM,
      photoUrl: null, // photo lives in IndexedDB, not localStorage
    };
    s[place.id] = stamp;
    store(KEYS.stamps, s);
    await idbSet(place.id, dataUrl);
    return ok({ stamp: { ...stamp, photoUrl: dataUrl } }, 201);
  }

  const collect = path.match(/^\/api\/places\/([^/]+)\/collect$/);
  if (collect && method === 'POST') {
    const place = (await allPlaces()).find((p) => p.id === collect[1]);
    if (!place) return fail(404, 'PLACE_NOT_FOUND');
    const { lat, lng } = b;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return fail(400, 'INVALID_COORDINATES');
    }
    const distanceM = haversineMeters(lat, lng, place.lat, place.lng);
    if (distanceM > COLLECT_RADIUS_M) {
      return fail(403, 'TOO_FAR', { distanceM: Math.round(distanceM) });
    }
    const s = stamps();
    if (s[place.id]) return fail(409, 'ALREADY_COLLECTED');
    const stamp: Stamp = {
      id: crypto.randomUUID(),
      placeId: place.id,
      collectedAt: new Date().toISOString(),
      distanceM,
      photoUrl: null,
    };
    s[place.id] = stamp;
    store(KEYS.stamps, s);
    return ok({ stamp }, 201);
  }

  return fail(404, 'NOT_FOUND');
}
