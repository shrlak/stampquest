// Browser-only backend for the static GitHub Pages build. It mirrors the
// REST API, including real sign-up/sign-in behavior and account isolation,
// while keeping every byte on this device.
import { COLLECT_RADIUS_M, PHOTO_RADIUS_M, haversineMeters } from './geo';
import { idbDelete, idbGet, idbKeys, idbSet } from './idb';
import { SEED_PLACES } from '../data/seedPlaces';
import type {
  GeocodedLocation,
  Place,
  PlaceCategory,
  Stamp,
  Stats,
  User,
} from '../types';

const GLOBAL_KEYS = {
  accounts: 'stampquest.local.accounts.v2',
  session: 'stampquest.local.session.v2',
  geocodeCache: 'stampquest.local.geocode-cache.v2',
  geocodeLastRequest: 'stampquest.local.geocode-last-request.v1',
};

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;
const PASSWORD_ITERATIONS = 150_000;

interface LocalAccount {
  id: number;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
}

interface CustomPlace {
  id: string;
  name: string;
  country: string;
  description: string;
  lat: number;
  lng: number;
  category?: PlaceCategory;
  state?: string | null;
  createdAt: string;
}

interface LocalResult {
  status: number;
  data: unknown;
}

interface NominatimResult {
  lat?: unknown;
  lon?: unknown;
  display_name?: unknown;
  name?: unknown;
  addresstype?: unknown;
  type?: unknown;
  boundingbox?: unknown;
  address?: unknown;
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

const normalizeSearchText = (value: string) =>
  value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('en');

let geocodeQueue: Promise<void> = Promise.resolve();

function inferCategory(result: NominatimResult): PlaceCategory {
  const addressType = typeof result.addresstype === 'string' ? result.addresstype : '';
  const type = typeof result.type === 'string' ? result.type : '';
  const classification = `${addressType} ${type}`.toLocaleLowerCase('en');
  if (/\b(state|province|region)\b/.test(classification)) return 'us-state';
  if (/\b(city|town|village|municipality|borough)\b/.test(classification)) return 'city';
  return 'landmark';
}

function parseBounds(value: unknown): GeocodedLocation['bounds'] {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const [south, north, west, east] = value.map(Number);
  if (
    ![south, north, west, east].every(Number.isFinite) ||
    south < -90 ||
    south > north ||
    north > 90 ||
    west < -180 ||
    east > 180
  ) {
    return null;
  }
  return { south, north, west, east };
}

async function geocodeWithNominatim(query: string): Promise<GeocodedLocation | null> {
  const key = normalizeSearchText(query);
  const cached = load<Record<string, GeocodedLocation | null>>(GLOBAL_KEYS.geocodeCache, {});
  if (Object.hasOwn(cached, key)) return cached[key] ?? null;

  let release: (() => void) | undefined;
  const previous = geocodeQueue;
  geocodeQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;

  try {
    const refreshed = load<Record<string, GeocodedLocation | null>>(
      GLOBAL_KEYS.geocodeCache,
      {},
    );
    if (Object.hasOwn(refreshed, key)) return refreshed[key] ?? null;

    const lastRequest = load<number>(GLOBAL_KEYS.geocodeLastRequest, 0);
    const remaining = 1_000 - (Date.now() - lastRequest);
    if (remaining > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remaining));
    }
    store(GLOBAL_KEYS.geocodeLastRequest, Date.now());

    const endpoint = new URL(
      import.meta.env.VITE_GEOCODER_URL ?? 'https://nominatim.openstreetmap.org/search',
    );
    endpoint.searchParams.set('q', query);
    endpoint.searchParams.set('format', 'jsonv2');
    endpoint.searchParams.set('limit', '1');
    endpoint.searchParams.set('addressdetails', '1');
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json', 'Accept-Language': 'en' },
    });
    if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);

    const body = (await response.json()) as unknown;
    const first = Array.isArray(body) ? (body[0] as NominatimResult | undefined) : undefined;
    const lat = Number(first?.lat);
    const lng = Number(first?.lon);
    const category = first ? inferCategory(first) : 'landmark';
    const address =
      first?.address && typeof first.address === 'object'
        ? (first.address as Record<string, unknown>)
        : {};
    const match =
      first &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
        ? {
            lat,
            lng,
            label:
              typeof first.display_name === 'string' && first.display_name.trim()
                ? first.display_name.trim()
                : query,
            source: 'openstreetmap' as const,
            category,
            stateName:
              category === 'us-state'
                ? typeof address.state === 'string'
                  ? address.state
                  : typeof first.name === 'string'
                    ? first.name
                    : null
                : null,
            bounds: parseBounds(first.boundingbox),
          }
        : null;
    const entries = Object.entries({ ...refreshed, [key]: match });
    store(GLOBAL_KEYS.geocodeCache, Object.fromEntries(entries.slice(-100)));
    return match;
  } finally {
    release?.();
  }
}

const accounts = () => load<LocalAccount[]>(GLOBAL_KEYS.accounts, []);
const accountKey = (accountId: number, suffix: string) =>
  `stampquest.local.account.${accountId}.${suffix}`;
const stampsKey = (accountId: number) => accountKey(accountId, 'stamps');
const placesKey = (accountId: number) => accountKey(accountId, 'customPlaces');
const photoPrefix = (accountId: number) => accountKey(accountId, 'photo.');
const profilePhotoKey = (accountId: number) => `${photoPrefix(accountId)}profile`;
const stampPhotoKey = (accountId: number, placeId: string) =>
  `${photoPrefix(accountId)}place.${placeId}`;

const stamps = (accountId: number) => load<Record<string, Stamp>>(stampsKey(accountId), {});
const customPlaces = (accountId: number) =>
  load<CustomPlace[]>(placesKey(accountId), []);

function activeAccount(): LocalAccount | null {
  const accountId = load<number | null>(GLOBAL_KEYS.session, null);
  return accountId === null ? null : (accounts().find((account) => account.id === accountId) ?? null);
}

function publicUser(account: LocalAccount, photoUrl: string | null): User {
  return {
    id: account.id,
    username: account.username,
    createdAt: account.createdAt,
    photoUrl,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function passwordHash(password: string, saltBase64: string): Promise<string> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: base64ToBuffer(saltBase64),
      iterations: PASSWORD_ITERATIONS,
    },
    material,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

function newSalt(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
}

function toPlace(
  seedOrCustom: (typeof SEED_PLACES)[number] | CustomPlace,
  curated: boolean,
  stampMap: Record<string, Stamp>,
): Place {
  const seed = curated ? (seedOrCustom as (typeof SEED_PLACES)[number]) : null;
  const custom = curated ? null : (seedOrCustom as CustomPlace);
  return {
    id: seedOrCustom.id,
    name: seedOrCustom.name,
    country: seedOrCustom.country,
    description: seedOrCustom.description,
    lat: seedOrCustom.lat,
    lng: seedOrCustom.lng,
    isCurated: curated,
    isMine: !curated,
    artKey: seed?.artKey ?? null,
    category: seed?.category ?? custom?.category ?? 'landmark',
    state: seed?.state ?? custom?.state ?? null,
    createdAt: curated ? '' : (seedOrCustom as CustomPlace).createdAt,
    stamp: stampMap[seedOrCustom.id] ?? null,
  };
}

async function withPhoto(accountId: number, place: Place): Promise<Place> {
  if (!place.stamp) return place;
  const photo = await idbGet(stampPhotoKey(accountId, place.id));
  return photo ? { ...place, stamp: { ...place.stamp, photoUrl: photo } } : place;
}

async function allPlaces(accountId: number): Promise<Place[]> {
  const stampMap = stamps(accountId);
  const bare = [
    ...SEED_PLACES.map((seed) => toPlace(seed, true, stampMap)),
    ...customPlaces(accountId).map((place) => toPlace(place, false, stampMap)),
  ];
  return Promise.all(bare.map((place) => withPhoto(accountId, place)));
}

function stats(accountId: number): Stats {
  const collected = Object.keys(stamps(accountId));
  const byId = new Map(
    [...SEED_PLACES, ...customPlaces(accountId)].map((place) => [place.id, place.country] as const),
  );
  return {
    stampCount: collected.length,
    countryCount: new Set(collected.map((id) => byId.get(id)).filter(Boolean)).size,
  };
}

async function me(account: LocalAccount): Promise<LocalResult> {
  const photoUrl = (await idbGet(profilePhotoKey(account.id))) ?? null;
  return {
    status: 200,
    data: { user: publicUser(account, photoUrl), stats: stats(account.id) },
  };
}

const ok = (data: unknown, status = 200): LocalResult => ({ status, data });
const fail = (status: number, error: string, extra?: Record<string, unknown>): LocalResult => ({
  status,
  data: { error, ...extra },
});

/** Clears the signed-in account's passport while preserving every account. */
export async function resetLocalData(): Promise<void> {
  const account = activeAccount();
  if (!account) return;
  localStorage.removeItem(stampsKey(account.id));
  localStorage.removeItem(placesKey(account.id));
  const keys = await idbKeys();
  const prefix = photoPrefix(account.id);
  await Promise.all(
    keys
      .filter((key): key is string => typeof key === 'string' && key.startsWith(prefix))
      .map((key) => idbDelete(key)),
  );
}

export async function localRequest(
  path: string,
  method: string,
  body: unknown,
): Promise<LocalResult> {
  const b = (body ?? {}) as Record<string, unknown>;

  if (path === '/api/auth/register' && method === 'POST') {
    const { username, password } = b;
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
      return fail(400, 'INVALID_USERNAME');
    }
    if (typeof password !== 'string' || password.length < 8) {
      return fail(400, 'WEAK_PASSWORD');
    }
    const existing = accounts().some(
      (account) => account.username.toLowerCase() === username.toLowerCase(),
    );
    if (existing) return fail(409, 'USERNAME_TAKEN');

    const allAccounts = accounts();
    const salt = newSalt();
    const account: LocalAccount = {
      id: allAccounts.reduce((max, candidate) => Math.max(max, candidate.id), 0) + 1,
      username,
      passwordHash: await passwordHash(password, salt),
      passwordSalt: salt,
      createdAt: new Date().toISOString(),
    };
    store(GLOBAL_KEYS.accounts, [...allAccounts, account]);
    store(GLOBAL_KEYS.session, account.id);
    const result = await me(account);
    return { ...result, status: 201 };
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const { username, password } = b;
    if (typeof username !== 'string' || typeof password !== 'string') {
      return fail(400, 'INVALID_REQUEST');
    }
    const account = accounts().find(
      (candidate) => candidate.username.toLowerCase() === username.toLowerCase(),
    );
    if (!account || (await passwordHash(password, account.passwordSalt)) !== account.passwordHash) {
      return fail(401, 'INVALID_CREDENTIALS');
    }
    store(GLOBAL_KEYS.session, account.id);
    return me(account);
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    localStorage.removeItem(GLOBAL_KEYS.session);
    return ok({ ok: true });
  }

  const account = activeAccount();
  if (!account) return fail(401, 'AUTH_REQUIRED');

  if (path === '/api/auth/me' && method === 'GET') return me(account);

  if (path === '/api/auth/me/photo' && method === 'PUT') {
    const dataUrl = b.photo;
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return fail(400, 'INVALID_PHOTO');
    }
    await idbSet(profilePhotoKey(account.id), dataUrl);
    return ok({ user: publicUser(account, dataUrl) });
  }

  if (path === '/api/places/geocode' && method === 'POST') {
    const { name, location, country, hasPhotoGps } = b;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
      return fail(400, 'INVALID_NAME');
    }
    if (
      typeof location !== 'string' ||
      location.trim().length > 120 ||
      typeof country !== 'string' ||
      !country.trim() ||
      country.trim().length > 60
    ) {
      return fail(400, 'INVALID_LOCATION_QUERY');
    }

    const normalizedCountry = normalizeSearchText(country);
    const normalizedName = normalizeSearchText(name);
    const normalizedLocation = normalizeSearchText(location);
    const findCatalogMatch = (hint: string) =>
      SEED_PLACES.find((place) => {
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
    // A location-only catalog match is useful for confirming photo GPS. When
    // there is no photo location, let the full query resolve the actual point
    // instead of silently dropping a cafe or address at the city center.
    const catalogMatch =
      catalogNameMatch ?? (hasPhotoGps === true ? findCatalogMatch(normalizedLocation) : undefined);
    if (catalogMatch) {
      const category = catalogNameMatch?.category ?? 'landmark';
      return ok({
        location: {
          lat: catalogMatch.lat,
          lng: catalogMatch.lng,
          label: `${catalogMatch.name}, ${catalogMatch.country}`,
          source: 'catalog',
          category,
          stateName: category === 'us-state' ? catalogMatch.state : null,
          bounds: null,
        } satisfies GeocodedLocation,
      });
    }

    const query = [name.trim(), location.trim(), country.trim()].filter(Boolean).join(', ');
    try {
      const match = await geocodeWithNominatim(query);
      return match ? ok({ location: match }) : fail(404, 'LOCATION_NOT_FOUND');
    } catch {
      return fail(502, 'GEOCODER_UNAVAILABLE');
    }
  }

  if (path === '/api/places' && method === 'GET') {
    return ok({ places: await allPlaces(account.id) });
  }

  if (path === '/api/places' && method === 'POST') {
    const { name, country, description, lat, lng, category, state } = b;
    if (typeof name !== 'string' || !name.trim()) return fail(400, 'INVALID_NAME');
    if (typeof country !== 'string' || !country.trim()) return fail(400, 'INVALID_COUNTRY');
    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      return fail(400, 'INVALID_COORDINATES');
    }
    const placeCategory = category === undefined ? 'landmark' : category;
    if (
      placeCategory !== 'landmark' &&
      placeCategory !== 'city' &&
      placeCategory !== 'us-state'
    ) {
      return fail(400, 'INVALID_CATEGORY');
    }
    const place: CustomPlace = {
      id: crypto.randomUUID(),
      name: name.trim().slice(0, 80),
      country: country.trim().slice(0, 60),
      description: typeof description === 'string' ? description.trim().slice(0, 400) : '',
      lat,
      lng,
      category: placeCategory,
      state:
        placeCategory === 'us-state'
          ? typeof state === 'string' && state.trim()
            ? state.trim().slice(0, 60)
            : name.trim().slice(0, 60)
          : null,
      createdAt: new Date().toISOString(),
    };
    store(placesKey(account.id), [...customPlaces(account.id), place]);
    return ok({ place: toPlace(place, false, stamps(account.id)) }, 201);
  }

  const detail = path.match(/^\/api\/places\/([^/]+)$/);
  if (detail) {
    const place = (await allPlaces(account.id)).find((candidate) => candidate.id === detail[1]);
    if (!place) return fail(404, 'PLACE_NOT_FOUND');
    if (method === 'GET') return ok({ place });
    if (method === 'DELETE') {
      if (place.isCurated) return fail(404, 'PLACE_NOT_FOUND');
      store(
        placesKey(account.id),
        customPlaces(account.id).filter((candidate) => candidate.id !== place.id),
      );
      const stampMap = stamps(account.id);
      delete stampMap[place.id];
      store(stampsKey(account.id), stampMap);
      await idbDelete(stampPhotoKey(account.id, place.id));
      return ok({ ok: true });
    }
  }

  const photo = path.match(/^\/api\/places\/([^/]+)\/photo$/);
  if (photo && method === 'PUT') {
    const stampMap = stamps(account.id);
    if (!stampMap[photo[1]]) return fail(409, 'NOT_COLLECTED');
    const dataUrl = b.photo;
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return fail(400, 'INVALID_PHOTO');
    }
    await idbSet(stampPhotoKey(account.id, photo[1]), dataUrl);
    return ok({ stamp: { ...stampMap[photo[1]], photoUrl: dataUrl } });
  }

  // Photo-evidence collection uses EXIF GPS in static mode. Vision matching
  // remains a server-only capability.
  const collectPhoto = path.match(/^\/api\/places\/([^/]+)\/collect-photo$/);
  if (collectPhoto && method === 'POST') {
    const place = (await allPlaces(account.id)).find(
      (candidate) => candidate.id === collectPhoto[1],
    );
    if (!place) return fail(404, 'PLACE_NOT_FOUND');
    const stampMap = stamps(account.id);
    if (stampMap[place.id]) return fail(409, 'ALREADY_COLLECTED');
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
      photoUrl: null,
    };
    stampMap[place.id] = stamp;
    store(stampsKey(account.id), stampMap);
    await idbSet(stampPhotoKey(account.id, place.id), dataUrl);
    return ok({ stamp: { ...stamp, photoUrl: dataUrl } }, 201);
  }

  const collect = path.match(/^\/api\/places\/([^/]+)\/collect$/);
  if (collect && method === 'POST') {
    const place = (await allPlaces(account.id)).find((candidate) => candidate.id === collect[1]);
    if (!place) return fail(404, 'PLACE_NOT_FOUND');
    const { lat, lng } = b;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return fail(400, 'INVALID_COORDINATES');
    }
    const distanceM = haversineMeters(lat, lng, place.lat, place.lng);
    if (distanceM > COLLECT_RADIUS_M) {
      return fail(403, 'TOO_FAR', { distanceM: Math.round(distanceM) });
    }
    const stampMap = stamps(account.id);
    if (stampMap[place.id]) return fail(409, 'ALREADY_COLLECTED');
    const stamp: Stamp = {
      id: crypto.randomUUID(),
      placeId: place.id,
      collectedAt: new Date().toISOString(),
      distanceM,
      photoUrl: null,
    };
    stampMap[place.id] = stamp;
    store(stampsKey(account.id), stampMap);
    return ok({ stamp }, 201);
  }

  return fail(404, 'NOT_FOUND');
}
