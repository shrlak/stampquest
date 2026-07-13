// Browser-only backend for the static build (GitHub Pages demo mode).
// Mirrors the REST API's paths and responses so the rest of the app is
// unchanged; data lives in localStorage on this device. Selected at build
// time via VITE_BACKEND=local (see api.ts).
import { COLLECT_RADIUS_M, haversineMeters } from './geo';
import { SEED_PLACES } from '../data/seedPlaces';
import type { Place, Stamp, Stats, User } from '../types';

const KEYS = {
  profile: 'stampquest.profile',
  stamps: 'stampquest.stamps',
  places: 'stampquest.customPlaces',
};

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

function profile(): User {
  let user = load<User | null>(KEYS.profile, null);
  if (!user) {
    user = {
      id: 1,
      email: 'traveler@stampquest.local',
      displayName: 'Traveler',
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
    createdAt: curated ? '' : (seedOrCustom as CustomPlace).createdAt,
    stamp: stamps()[seedOrCustom.id] ?? null,
  };
}

function allPlaces(): Place[] {
  return [
    ...SEED_PLACES.map((s) => toPlace(s, true)),
    ...customPlaces().map((c) => toPlace(c, false)),
  ];
}

function stats(): Stats {
  const collected = allPlaces().filter((p) => p.stamp);
  return {
    stampCount: collected.length,
    countryCount: new Set(collected.map((p) => p.country)).size,
  };
}

function me(): LocalResult {
  return { status: 200, data: { user: profile(), stats: stats() } };
}

const ok = (data: unknown, status = 200): LocalResult => ({ status, data });
const fail = (status: number, error: string, extra?: Record<string, unknown>): LocalResult => ({
  status,
  data: { error, ...extra },
});

/** Clears everything this device knows — used by the demo-mode reset. */
export function resetLocalData(): void {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
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

  if (path === '/api/places' && method === 'GET') return ok({ places: allPlaces() });

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
    const place = allPlaces().find((p) => p.id === detail[1]);
    if (!place) return fail(404, 'PLACE_NOT_FOUND');
    if (method === 'GET') return ok({ place });
    if (method === 'DELETE') {
      if (place.isCurated) return fail(404, 'PLACE_NOT_FOUND');
      store(KEYS.places, customPlaces().filter((p) => p.id !== place.id));
      const s = stamps();
      delete s[place.id];
      store(KEYS.stamps, s);
      return ok({ ok: true });
    }
  }

  const collect = path.match(/^\/api\/places\/([^/]+)\/collect$/);
  if (collect && method === 'POST') {
    const place = allPlaces().find((p) => p.id === collect[1]);
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
    };
    s[place.id] = stamp;
    store(KEYS.stamps, s);
    return ok({ stamp }, 201);
  }

  return fail(404, 'NOT_FOUND');
}
