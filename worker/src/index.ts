import { SEED_PLACES, type SeedPlace } from '../../client/src/data/seedPlaces';
import {
  COLLECT_RADIUS_M,
  PHOTO_RADIUS_M,
  haversineMeters,
} from '../../client/src/lib/geo';

interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  ALLOWED_ORIGIN?: string;
  GEOCODER_URL?: string;
}

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  media_token: string;
  photo_mime: string | null;
  photo_updated_at: string | null;
  data_version: number;
  local_migration_session_hash: string | null;
  local_migration_started_at: string | null;
  local_migration_completed_at: string | null;
  created_at: string;
}

interface SessionUser extends UserRow {
  session_hash: string;
}

interface CustomPlaceRow {
  id: string;
  user_id: number;
  name: string;
  country: string;
  description: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  state: string | null;
  created_at: string;
}

interface StampRow {
  id: string;
  user_id: number;
  place_id: string;
  place_country: string;
  collected_at: string;
  collected_lat: number | null;
  collected_lng: number | null;
  distance_m: number | null;
  photo_mime: string | null;
  photo_updated_at: string | null;
}

type PlaceCategory = 'landmark' | 'city' | 'us-state';

interface PlaceData {
  id: string;
  name: string;
  country: string;
  description: string;
  lat: number;
  lng: number;
  isCurated: boolean;
  isMine: boolean;
  artKey: string | null;
  category: PlaceCategory;
  state: string | null;
  createdAt: string;
}

interface PhotoData {
  bytes: Uint8Array;
  mime: string;
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

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;
// workerd rejects PBKDF2 operations above 100,000 iterations. Keep this at
// the platform maximum so registration and login work in Cloudflare Workers.
// https://github.com/cloudflare/workerd/issues/1346
const PASSWORD_ITERATIONS = 100_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MIGRATION_LEASE_MS = 30 * 60 * 1000;
const PHOTO_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_MIGRATION_CUSTOM_PLACES = 80;
const MAX_MIGRATION_STAMPS = 160;
const MAX_MIGRATION_PHOTO_IDS = 200;
const seedById = new Map(SEED_PLACES.map((place) => [place.id, place]));

const encoder = new TextEncoder();

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function safeDate(value: unknown): string {
  if (typeof value === 'string' && value.length <= 64) {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return new Date().toISOString();
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    '=',
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function randomToken(size = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(size)));
}

async function sha256(value: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

async function passwordHash(password: string, salt: string, iterations: number): Promise<string> {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: fromBase64Url(salt),
      iterations,
    },
    material,
    256,
  );
  return base64Url(new Uint8Array(bits));
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  if (origin === (env.ALLOWED_ORIGIN ?? 'https://shrlak.github.io')) return origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = allowedOrigin(request, env);
  return origin
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        Vary: 'Origin',
      }
    : {};
}

function json(request: Request, env: Env, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request, env),
    },
  });
}

async function body(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (length > 6 * 1024 * 1024) throw new Error('BODY_TOO_LARGE');
  const parsed = await request.json().catch(() => ({}));
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
}

function bearerToken(request: Request): string | null {
  const match = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function currentUser(request: Request, env: Env): Promise<SessionUser | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const user = await env.DB.prepare(
    `SELECT u.*, s.token_hash AS session_hash
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(tokenHash, new Date().toISOString())
    .first<SessionUser>();
  return user ?? null;
}

async function requireUser(request: Request, env: Env): Promise<SessionUser | Response> {
  const user = await currentUser(request, env);
  return user ?? json(request, env, { error: 'UNAUTHENTICATED' }, 401);
}

async function createSession(env: Env, userId: number): Promise<string> {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const now = new Date();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now.toISOString()),
    env.DB.prepare(
      'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    ).bind(tokenHash, userId, now.toISOString(), new Date(now.getTime() + SESSION_TTL_MS).toISOString()),
  ]);
  return token;
}

function mediaUrl(origin: string, user: UserRow, path: string, version: string): string {
  const url = new URL(`/api/media/${path}`, origin);
  url.searchParams.set('user', String(user.id));
  url.searchParams.set('token', user.media_token);
  url.searchParams.set('v', version);
  return url.toString();
}

function serializeUser(user: UserRow, origin: string) {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.created_at,
    photoUrl:
      user.photo_updated_at && user.photo_mime
        ? mediaUrl(origin, user, 'profile', user.photo_updated_at)
        : null,
  };
}

function serializeStamp(stamp: StampRow, user: UserRow, origin: string) {
  return {
    id: stamp.id,
    placeId: stamp.place_id,
    collectedAt: stamp.collected_at,
    distanceM: stamp.distance_m,
    photoUrl:
      stamp.photo_updated_at && stamp.photo_mime
        ? mediaUrl(origin, user, `stamps/${encodeURIComponent(stamp.place_id)}`, stamp.photo_updated_at)
        : null,
  };
}

function seedPlace(seed: SeedPlace): PlaceData {
  return {
    ...seed,
    isCurated: true,
    isMine: false,
    createdAt: '',
  };
}

function customPlace(place: CustomPlaceRow): PlaceData {
  return {
    id: place.id,
    name: place.name,
    country: place.country,
    description: place.description,
    lat: place.lat,
    lng: place.lng,
    isCurated: false,
    isMine: true,
    artKey: null,
    category: place.category,
    state: place.state,
    createdAt: place.created_at,
  };
}

function serializePlace(
  place: PlaceData,
  stamp: StampRow | null,
  user: UserRow,
  origin: string,
) {
  return { ...place, stamp: stamp ? serializeStamp(stamp, user, origin) : null };
}

async function stats(env: Env, userId: number) {
  const [stamps, countries] = await env.DB.batch([
    env.DB.prepare('SELECT count(*) AS value FROM stamps WHERE user_id = ?').bind(userId),
    env.DB.prepare(
      'SELECT count(DISTINCT place_country) AS value FROM stamps WHERE user_id = ?',
    ).bind(userId),
  ]);
  return {
    stampCount: Number((stamps.results[0] as { value?: number } | undefined)?.value ?? 0),
    countryCount: Number((countries.results[0] as { value?: number } | undefined)?.value ?? 0),
  };
}

async function visiblePlace(env: Env, placeId: string, userId: number): Promise<PlaceData | null> {
  const seed = seedById.get(placeId);
  if (seed) return seedPlace(seed);
  const custom = await env.DB.prepare('SELECT * FROM custom_places WHERE id = ? AND user_id = ?')
    .bind(placeId, userId)
    .first<CustomPlaceRow>();
  return custom ? customPlace(custom) : null;
}

async function stampFor(env: Env, placeId: string, userId: number): Promise<StampRow | null> {
  return (
    (await env.DB.prepare('SELECT * FROM stamps WHERE place_id = ? AND user_id = ?')
      .bind(placeId, userId)
      .first<StampRow>()) ?? null
  );
}

function decodePhoto(value: unknown): PhotoData | null {
  const match = typeof value === 'string' ? value.match(PHOTO_DATA_URL) : null;
  if (!match) return null;
  const binary = atob(match[2]);
  if (binary.length > MAX_PHOTO_BYTES) return null;
  return {
    bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    mime: `image/${match[1]}`,
  };
}

function profilePhotoKey(userId: number): string {
  return `users/${userId}/profile`;
}

function stampPhotoKey(userId: number, placeId: string): string {
  return `users/${userId}/stamps/${encodeURIComponent(placeId)}`;
}

async function saveStamp(
  env: Env,
  user: UserRow,
  place: PlaceData,
  coords: { lat: number; lng: number } | null,
  distanceM: number | null,
  photo: PhotoData | null,
): Promise<StampRow> {
  const stamp: StampRow = {
    id: crypto.randomUUID(),
    user_id: user.id,
    place_id: place.id,
    place_country: place.country,
    collected_at: new Date().toISOString(),
    collected_lat: coords?.lat ?? null,
    collected_lng: coords?.lng ?? null,
    distance_m: distanceM,
    photo_mime: photo?.mime ?? null,
    photo_updated_at: photo ? new Date().toISOString() : null,
  };
  await env.DB.prepare(
    `INSERT INTO stamps
       (id, user_id, place_id, place_country, collected_at, collected_lat, collected_lng,
        distance_m, photo_mime, photo_updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      stamp.id,
      stamp.user_id,
      stamp.place_id,
      stamp.place_country,
      stamp.collected_at,
      stamp.collected_lat,
      stamp.collected_lng,
      stamp.distance_m,
      stamp.photo_mime,
      stamp.photo_updated_at,
    )
    .run();
  if (photo) {
    try {
      await env.PHOTOS.put(stampPhotoKey(user.id, place.id), photo.bytes, {
        httpMetadata: { contentType: photo.mime },
      });
    } catch (error) {
      await env.DB.prepare('DELETE FROM stamps WHERE id = ?').bind(stamp.id).run();
      throw error;
    }
  }
  await env.DB.prepare('UPDATE users SET data_version = data_version + 1 WHERE id = ?')
    .bind(user.id)
    .run();
  return stamp;
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('en');
}

function inferCategory(result: NominatimResult): PlaceCategory {
  const addressType = typeof result.addresstype === 'string' ? result.addresstype : '';
  const type = typeof result.type === 'string' ? result.type : '';
  const classification = `${addressType} ${type}`.toLocaleLowerCase('en');
  if (/\b(state|province|region)\b/.test(classification)) return 'us-state';
  if (/\b(city|town|village|municipality|borough)\b/.test(classification)) return 'city';
  return 'landmark';
}

function parseBounds(value: unknown) {
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

async function handleAuth(request: Request, env: Env, path: string): Promise<Response | null> {
  const origin = new URL(request.url).origin;
  if (path === '/api/auth/register' && request.method === 'POST') {
    const payload = await body(request);
    const { username, password } = payload;
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
      return json(request, env, { error: 'INVALID_USERNAME' }, 400);
    }
    if (typeof password !== 'string' || password.length < 8) {
      return json(request, env, { error: 'WEAK_PASSWORD' }, 400);
    }
    const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE')
      .bind(username)
      .first();
    if (existing) return json(request, env, { error: 'USERNAME_TAKEN' }, 409);

    const salt = randomToken(16);
    const hash = await passwordHash(password, salt, PASSWORD_ITERATIONS);
    const now = new Date().toISOString();
    try {
      const inserted = await env.DB.prepare(
        `INSERT INTO users
           (username, password_hash, password_salt, password_iterations, media_token, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(username, hash, salt, PASSWORD_ITERATIONS, randomToken(), now)
        .run();
      const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
        .bind(inserted.meta.last_row_id)
        .first<UserRow>();
      if (!user) throw new Error('USER_INSERT_FAILED');
      const sessionToken = await createSession(env, user.id);
      return json(
        request,
        env,
        {
          user: serializeUser(user, origin),
          stats: await stats(env, user.id),
          syncVersion: user.data_version,
          sessionToken,
        },
        201,
      );
    } catch (error) {
      if (String(error).toLocaleLowerCase('en').includes('unique')) {
        return json(request, env, { error: 'USERNAME_TAKEN' }, 409);
      }
      throw error;
    }
  }

  if (path === '/api/auth/login' && request.method === 'POST') {
    const payload = await body(request);
    const { username, password } = payload;
    if (typeof username !== 'string' || typeof password !== 'string') {
      return json(request, env, { error: 'INVALID_REQUEST' }, 400);
    }
    const user = await env.DB.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
      .bind(username)
      .first<UserRow>();
    if (!user) return json(request, env, { error: 'INVALID_CREDENTIALS' }, 401);
    const candidate = await passwordHash(password, user.password_salt, user.password_iterations);
    if (!constantTimeEqual(candidate, user.password_hash)) {
      return json(request, env, { error: 'INVALID_CREDENTIALS' }, 401);
    }
    // A normal login is never allowed to start a new legacy import. Only the
    // session created together with a brand-new cloud account may claim it.
    // This also protects accounts from older cached clients on another device.
    await env.DB.prepare(
      `UPDATE users
       SET local_migration_completed_at = ?
       WHERE id = ?
         AND local_migration_completed_at IS NULL
         AND local_migration_session_hash IS NULL`,
    )
      .bind(new Date().toISOString(), user.id)
      .run();
    const sessionToken = await createSession(env, user.id);
    return json(request, env, {
      user: serializeUser(user, origin),
      stats: await stats(env, user.id),
      syncVersion: user.data_version,
      sessionToken,
    });
  }

  if (path === '/api/auth/logout' && request.method === 'POST') {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(user.session_hash).run();
    return json(request, env, { ok: true });
  }

  if (path === '/api/auth/me' && request.method === 'GET') {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    return json(request, env, {
      user: serializeUser(user, origin),
      stats: await stats(env, user.id),
      syncVersion: user.data_version,
    });
  }

  if (path === '/api/sync' && request.method === 'GET') {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    return json(request, env, { version: user.data_version });
  }

  if (path === '/api/auth/me/photo' && request.method === 'PUT') {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    const photo = decodePhoto((await body(request)).photo);
    if (!photo) return json(request, env, { error: 'INVALID_PHOTO' }, 400);
    const updatedAt = new Date().toISOString();
    await env.PHOTOS.put(profilePhotoKey(user.id), photo.bytes, {
      httpMetadata: { contentType: photo.mime },
    });
    await env.DB.prepare(
      `UPDATE users
       SET photo_mime = ?, photo_updated_at = ?, data_version = data_version + 1
       WHERE id = ?`,
    )
      .bind(photo.mime, updatedAt, user.id)
      .run();
    const updated = {
      ...user,
      photo_mime: photo.mime,
      photo_updated_at: updatedAt,
      data_version: user.data_version + 1,
    };
    return json(request, env, {
      user: serializeUser(updated, origin),
      syncVersion: updated.data_version,
    });
  }

  return null;
}

async function handleMedia(request: Request, env: Env, path: string): Promise<Response | null> {
  if (request.method !== 'GET' || !path.startsWith('/api/media/')) return null;
  const url = new URL(request.url);
  const userId = Number(url.searchParams.get('user'));
  const token = url.searchParams.get('token');
  if (!Number.isInteger(userId) || !token) return json(request, env, { error: 'NOT_FOUND' }, 404);
  const user = await env.DB.prepare('SELECT id, media_token FROM users WHERE id = ?')
    .bind(userId)
    .first<{ id: number; media_token: string }>();
  if (!user || !constantTimeEqual(user.media_token, token)) {
    return json(request, env, { error: 'NOT_FOUND' }, 404);
  }
  const suffix = path.slice('/api/media/'.length);
  const key =
    suffix === 'profile'
      ? profilePhotoKey(userId)
      : suffix.startsWith('stamps/')
        ? stampPhotoKey(userId, decodeURIComponent(suffix.slice('stamps/'.length)))
        : null;
  if (!key) return json(request, env, { error: 'NOT_FOUND' }, 404);
  const object = await env.PHOTOS.get(key);
  if (!object) return json(request, env, { error: 'NOT_FOUND' }, 404);
  const headers = new Headers(corsHeaders(request, env));
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', 'private, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body, { headers });
}

async function handleGeocode(request: Request, env: Env): Promise<Response> {
  const payload = await body(request);
  const { name, location, country, hasPhotoGps } = payload;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
    return json(request, env, { error: 'INVALID_NAME' }, 400);
  }
  if (
    typeof location !== 'string' ||
    location.trim().length > 120 ||
    typeof country !== 'string' ||
    !country.trim() ||
    country.trim().length > 60
  ) {
    return json(request, env, { error: 'INVALID_LOCATION_QUERY' }, 400);
  }

  const normalizedCountry = normalizeSearchText(country);
  const findCatalogMatch = (hint: string) =>
    SEED_PLACES.find((place) => {
      if (!hint || normalizeSearchText(place.country) !== normalizedCountry) return false;
      return [place.name, place.state]
        .filter((value): value is string => typeof value === 'string')
        .map(normalizeSearchText)
        .some((candidate) => hint === candidate || (candidate.length >= 4 && hint.includes(candidate)));
    });
  const catalogNameMatch = findCatalogMatch(normalizeSearchText(name));
  const catalogMatch =
    catalogNameMatch ??
    (hasPhotoGps === true ? findCatalogMatch(normalizeSearchText(location)) : undefined);
  if (catalogMatch) {
    const category = catalogNameMatch?.category ?? 'landmark';
    return json(request, env, {
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
  }

  const query = [name.trim(), location.trim(), country.trim()].filter(Boolean).join(', ');
  const endpoint = new URL(env.GEOCODER_URL ?? 'https://nominatim.openstreetmap.org/search');
  endpoint.searchParams.set('q', query);
  endpoint.searchParams.set('format', 'jsonv2');
  endpoint.searchParams.set('limit', '1');
  endpoint.searchParams.set('addressdetails', '1');
  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en',
      'User-Agent': 'StampQuest/0.1 (+https://github.com/shrlak/stampquest)',
    },
  });
  if (!response.ok) return json(request, env, { error: 'GEOCODER_UNAVAILABLE' }, 502);
  const results = (await response.json()) as NominatimResult[];
  const match = results[0];
  const lat = Number(match?.lat);
  const lng = Number(match?.lon);
  if (!match || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return json(request, env, { error: 'LOCATION_NOT_FOUND' }, 404);
  }
  const category = inferCategory(match);
  const address =
    match.address && typeof match.address === 'object'
      ? (match.address as Record<string, unknown>)
      : {};
  return json(request, env, {
    location: {
      lat,
      lng,
      label:
        typeof match.display_name === 'string' && match.display_name.trim()
          ? match.display_name.trim()
          : query,
      source: 'openstreetmap',
      category,
      stateName:
        category === 'us-state'
          ? typeof address.state === 'string'
            ? address.state
            : typeof match.name === 'string'
              ? match.name
              : null
          : null,
      bounds: parseBounds(match.boundingbox),
    },
  });
}

async function handleMigration(
  request: Request,
  env: Env,
  user: SessionUser,
): Promise<Response> {
  const payload = await body(request);
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseCutoff = new Date(now.getTime() - MIGRATION_LEASE_MS).toISOString();

  // Exactly one cloud session may import a legacy browser passport. This
  // prevents two devices that once had separate local accounts with the same
  // credentials from merging different identities into one cloud account.
  await env.DB.prepare(
    `UPDATE users
     SET local_migration_session_hash = ?, local_migration_started_at = ?
     WHERE id = ?
       AND local_migration_completed_at IS NULL
       AND (
         local_migration_session_hash IS NULL
         OR local_migration_session_hash = ?
         OR local_migration_started_at < ?
       )`,
  )
    .bind(user.session_hash, nowIso, user.id, user.session_hash, leaseCutoff)
    .run();
  const migrationState = await env.DB.prepare(
    `SELECT local_migration_session_hash, local_migration_completed_at
     FROM users WHERE id = ?`,
  )
    .bind(user.id)
    .first<{
      local_migration_session_hash: string | null;
      local_migration_completed_at: string | null;
    }>();
  if (migrationState?.local_migration_completed_at) {
    return json(request, env, {
      ok: true,
      migrationComplete: true,
      missingPhotoPlaceIds: [],
      needsProfilePhoto: false,
    });
  }
  if (migrationState?.local_migration_session_hash !== user.session_hash) {
    return json(request, env, {
      ok: true,
      migrationBusy: true,
      missingPhotoPlaceIds: [],
      needsProfilePhoto: false,
    });
  }

  const customPlaces = Array.isArray(payload.customPlaces) ? payload.customPlaces : [];
  const importedStamps = Array.isArray(payload.stamps) ? payload.stamps : [];
  const photoPlaceIds = Array.isArray(payload.photoPlaceIds)
    ? payload.photoPlaceIds.filter((value): value is string => typeof value === 'string')
    : [];
  if (
    customPlaces.length > MAX_MIGRATION_CUSTOM_PLACES ||
    importedStamps.length > MAX_MIGRATION_STAMPS ||
    photoPlaceIds.length > MAX_MIGRATION_PHOTO_IDS
  ) {
    return json(request, env, { error: 'MIGRATION_BATCH_TOO_LARGE' }, 400);
  }
  const importedPlaces = new Map<string, PlaceData>();

  for (const value of customPlaces) {
    if (!value || typeof value !== 'object') continue;
    const place = value as Record<string, unknown>;
    const category = place.category ?? 'landmark';
    if (
      typeof place.id !== 'string' ||
      !place.id ||
      place.id.length > 100 ||
      typeof place.name !== 'string' ||
      !place.name.trim() ||
      typeof place.country !== 'string' ||
      !place.country.trim() ||
      typeof place.lat !== 'number' ||
      typeof place.lng !== 'number' ||
      !Number.isFinite(place.lat) ||
      !Number.isFinite(place.lng) ||
      Math.abs(place.lat) > 90 ||
      Math.abs(place.lng) > 180 ||
      (category !== 'landmark' && category !== 'city' && category !== 'us-state')
    ) {
      continue;
    }
    const data: PlaceData = {
      id: place.id,
      name: place.name.trim().slice(0, 80),
      country: place.country.trim().slice(0, 60),
      description:
        typeof place.description === 'string' ? place.description.trim().slice(0, 400) : '',
      lat: place.lat,
      lng: place.lng,
      isCurated: false,
      isMine: true,
      artKey: null,
      category,
      state:
        category === 'us-state'
          ? typeof place.state === 'string' && place.state.trim()
            ? place.state.trim().slice(0, 60)
            : place.name.trim().slice(0, 60)
          : null,
      createdAt: safeDate(place.createdAt),
    };
    importedPlaces.set(data.id, data);
  }

  const customStatements = chunks([...importedPlaces.values()], 10).map((group) =>
    env.DB.prepare(
      `INSERT OR IGNORE INTO custom_places
         (id, user_id, name, country, description, lat, lng, category, state, created_at)
       VALUES ${group.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
    ).bind(
      ...group.flatMap((data) => [
        data.id,
        user.id,
        data.name,
        data.country,
        data.description,
        data.lat,
        data.lng,
        data.category,
        data.state,
        data.createdAt,
      ]),
    ),
  );
  if (customStatements.length) await env.DB.batch(customStatements);

  const parsedStamps: Array<{
    id: string;
    placeId: string;
    collectedAt: string;
    distanceM: number | null;
  }> = [];
  for (const value of importedStamps) {
    if (!value || typeof value !== 'object') continue;
    const stamp = value as Record<string, unknown>;
    if (
      typeof stamp.id !== 'string' ||
      !stamp.id ||
      stamp.id.length > 100 ||
      typeof stamp.placeId !== 'string' ||
      !stamp.placeId ||
      stamp.placeId.length > 100
    ) {
      continue;
    }
    parsedStamps.push({
      id: stamp.id,
      placeId: stamp.placeId,
      collectedAt: safeDate(stamp.collectedAt),
      distanceM:
        typeof stamp.distanceM === 'number' && Number.isFinite(stamp.distanceM)
          ? stamp.distanceM
          : null,
    });
  }

  const customIds = [
    ...new Set(parsedStamps.map((stamp) => stamp.placeId).filter((id) => !seedById.has(id))),
  ];
  const customCountries = new Map<string, string>();
  for (const group of chunks(customIds, 99)) {
    const result = await env.DB.prepare(
      `SELECT id, country FROM custom_places
       WHERE user_id = ? AND id IN (${group.map(() => '?').join(', ')})`,
    )
      .bind(user.id, ...group)
      .all<{ id: string; country: string }>();
    for (const row of result.results ?? []) customCountries.set(row.id, row.country);
  }

  const stampRows = parsedStamps.flatMap((stamp) => {
    const country = seedById.get(stamp.placeId)?.country ?? customCountries.get(stamp.placeId);
    return country ? [{ ...stamp, country }] : [];
  });
  const stampStatements = chunks(stampRows, 16).map((group) =>
    env.DB.prepare(
      `INSERT OR IGNORE INTO stamps
         (id, user_id, place_id, place_country, collected_at, distance_m)
       VALUES ${group.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')}`,
    ).bind(
      ...group.flatMap((stamp) => [
        stamp.id,
        user.id,
        stamp.placeId,
        stamp.country,
        stamp.collectedAt,
        stamp.distanceM,
      ]),
    ),
  );
  if (stampStatements.length) await env.DB.batch(stampStatements);

  const missingPhotoPlaceIds: string[] = [];
  const uniquePhotoPlaceIds = [...new Set(photoPlaceIds.filter((id) => id && id.length <= 100))];
  for (const group of chunks(uniquePhotoPlaceIds, 99)) {
    const result = await env.DB.prepare(
      `SELECT place_id FROM stamps
       WHERE user_id = ? AND photo_updated_at IS NULL
         AND place_id IN (${group.map(() => '?').join(', ')})`,
    )
      .bind(user.id, ...group)
      .all<{ place_id: string }>();
    for (const row of result.results ?? []) missingPhotoPlaceIds.push(row.place_id);
  }
  const refreshed = await env.DB.prepare('SELECT photo_updated_at FROM users WHERE id = ?')
    .bind(user.id)
    .first<{ photo_updated_at: string | null }>();
  const isFinalBatch =
    payload.complete === true ||
    (!Object.hasOwn(payload, 'customPlaces') &&
      !Object.hasOwn(payload, 'stamps') &&
      !Object.hasOwn(payload, 'photoPlaceIds'));
  if (isFinalBatch) {
    await env.DB.prepare(
      `UPDATE users
       SET local_migration_completed_at = ?,
           local_migration_session_hash = NULL,
           local_migration_started_at = NULL,
           data_version = data_version + 1
       WHERE id = ? AND local_migration_session_hash = ?`,
    )
      .bind(nowIso, user.id, user.session_hash)
      .run();
  }
  return json(request, env, {
    ok: true,
    migrationComplete: isFinalBatch,
    missingPhotoPlaceIds,
    needsProfilePhoto: !refreshed?.photo_updated_at,
  });
}

async function handlePlaces(request: Request, env: Env, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/places') && path !== '/api/migrate') return null;
  const authenticated = await requireUser(request, env);
  if (authenticated instanceof Response) return authenticated;
  const user = authenticated;
  const origin = new URL(request.url).origin;

  if (path === '/api/migrate' && request.method === 'POST') {
    return handleMigration(request, env, user);
  }

  if (path === '/api/places/geocode' && request.method === 'POST') {
    return handleGeocode(request, env);
  }

  if (path === '/api/places' && request.method === 'GET') {
    const [customResult, stampResult] = await env.DB.batch([
      env.DB.prepare('SELECT * FROM custom_places WHERE user_id = ? ORDER BY name').bind(user.id),
      env.DB.prepare('SELECT * FROM stamps WHERE user_id = ?').bind(user.id),
    ]);
    const stamps = (stampResult.results ?? []) as unknown as StampRow[];
    const stampMap = new Map(stamps.map((stamp) => [stamp.place_id, stamp]));
    const places = [
      ...SEED_PLACES.map(seedPlace),
      ...((customResult.results ?? []) as unknown as CustomPlaceRow[]).map(customPlace),
    ];
    return json(request, env, {
      places: places.map((place) =>
        serializePlace(place, stampMap.get(place.id) ?? null, user, origin),
      ),
    });
  }

  if (path === '/api/places' && request.method === 'POST') {
    const payload = await body(request);
    const { name, country, description, lat, lng, category, state } = payload;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
      return json(request, env, { error: 'INVALID_NAME' }, 400);
    }
    if (typeof country !== 'string' || !country.trim() || country.trim().length > 60) {
      return json(request, env, { error: 'INVALID_COUNTRY' }, 400);
    }
    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      return json(request, env, { error: 'INVALID_COORDINATES' }, 400);
    }
    const placeCategory = category ?? 'landmark';
    if (
      placeCategory !== 'landmark' &&
      placeCategory !== 'city' &&
      placeCategory !== 'us-state'
    ) {
      return json(request, env, { error: 'INVALID_CATEGORY' }, 400);
    }
    const place: CustomPlaceRow = {
      id: crypto.randomUUID(),
      user_id: user.id,
      name: name.trim(),
      country: country.trim(),
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
      created_at: new Date().toISOString(),
    };
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO custom_places
           (id, user_id, name, country, description, lat, lng, category, state, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        place.id,
        place.user_id,
        place.name,
        place.country,
        place.description,
        place.lat,
        place.lng,
        place.category,
        place.state,
        place.created_at,
      ),
      env.DB.prepare('UPDATE users SET data_version = data_version + 1 WHERE id = ?').bind(user.id),
    ]);
    return json(request, env, { place: serializePlace(customPlace(place), null, user, origin) }, 201);
  }

  const stampPhotoMatch = path.match(/^\/api\/places\/([^/]+)\/photo$/);
  if (stampPhotoMatch && request.method === 'PUT') {
    const placeId = decodeURIComponent(stampPhotoMatch[1]);
    const stamp = await stampFor(env, placeId, user.id);
    if (!stamp) return json(request, env, { error: 'NOT_COLLECTED' }, 409);
    const photo = decodePhoto((await body(request)).photo);
    if (!photo) return json(request, env, { error: 'INVALID_PHOTO' }, 400);
    const updatedAt = new Date().toISOString();
    await env.PHOTOS.put(stampPhotoKey(user.id, placeId), photo.bytes, {
      httpMetadata: { contentType: photo.mime },
    });
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE stamps SET photo_mime = ?, photo_updated_at = ? WHERE id = ? AND user_id = ?',
      ).bind(photo.mime, updatedAt, stamp.id, user.id),
      env.DB.prepare('UPDATE users SET data_version = data_version + 1 WHERE id = ?').bind(user.id),
    ]);
    return json(request, env, {
      stamp: serializeStamp(
        { ...stamp, photo_mime: photo.mime, photo_updated_at: updatedAt },
        user,
        origin,
      ),
    });
  }

  const collectPhotoMatch = path.match(/^\/api\/places\/([^/]+)\/collect-photo$/);
  if (collectPhotoMatch && request.method === 'POST') {
    const placeId = decodeURIComponent(collectPhotoMatch[1]);
    const place = await visiblePlace(env, placeId, user.id);
    if (!place) return json(request, env, { error: 'PLACE_NOT_FOUND' }, 404);
    if (await stampFor(env, placeId, user.id)) {
      return json(request, env, { error: 'ALREADY_COLLECTED' }, 409);
    }
    const payload = await body(request);
    const photo = decodePhoto(payload.photo);
    if (!photo) return json(request, env, { error: 'INVALID_PHOTO' }, 400);
    const { photoLat, photoLng } = payload;
    if (
      typeof photoLat !== 'number' ||
      typeof photoLng !== 'number' ||
      !Number.isFinite(photoLat) ||
      !Number.isFinite(photoLng) ||
      Math.abs(photoLat) > 90 ||
      Math.abs(photoLng) > 180
    ) {
      return json(
        request,
        env,
        { error: 'PHOTO_NO_LOCATION', landmarkCheckAvailable: false },
        403,
      );
    }
    const distanceM = haversineMeters(photoLat, photoLng, place.lat, place.lng);
    if (distanceM > PHOTO_RADIUS_M) {
      return json(request, env, { error: 'PHOTO_TOO_FAR', distanceM: Math.round(distanceM) }, 403);
    }
    const stamp = await saveStamp(
      env,
      user,
      place,
      { lat: photoLat, lng: photoLng },
      distanceM,
      photo,
    );
    return json(
      request,
      env,
      { stamp: serializeStamp(stamp, user, origin), verifiedBy: 'photo-gps' },
      201,
    );
  }

  const collectMatch = path.match(/^\/api\/places\/([^/]+)\/collect$/);
  if (collectMatch && request.method === 'POST') {
    const placeId = decodeURIComponent(collectMatch[1]);
    const place = await visiblePlace(env, placeId, user.id);
    if (!place) return json(request, env, { error: 'PLACE_NOT_FOUND' }, 404);
    if (await stampFor(env, placeId, user.id)) {
      return json(request, env, { error: 'ALREADY_COLLECTED' }, 409);
    }
    const payload = await body(request);
    const { lat, lng } = payload;
    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      return json(request, env, { error: 'INVALID_COORDINATES' }, 400);
    }
    const distanceM = haversineMeters(lat, lng, place.lat, place.lng);
    if (distanceM > COLLECT_RADIUS_M) {
      return json(request, env, { error: 'TOO_FAR', distanceM: Math.round(distanceM) }, 403);
    }
    const stamp = await saveStamp(env, user, place, { lat, lng }, distanceM, null);
    return json(request, env, { stamp: serializeStamp(stamp, user, origin) }, 201);
  }

  const detailMatch = path.match(/^\/api\/places\/([^/]+)$/);
  if (detailMatch) {
    const placeId = decodeURIComponent(detailMatch[1]);
    const place = await visiblePlace(env, placeId, user.id);
    if (!place) return json(request, env, { error: 'PLACE_NOT_FOUND' }, 404);
    if (request.method === 'GET') {
      return json(request, env, {
        place: serializePlace(place, await stampFor(env, placeId, user.id), user, origin),
      });
    }
    if (request.method === 'DELETE') {
      if (place.isCurated) return json(request, env, { error: 'PLACE_NOT_FOUND' }, 404);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM stamps WHERE user_id = ? AND place_id = ?').bind(user.id, placeId),
        env.DB.prepare('DELETE FROM custom_places WHERE user_id = ? AND id = ?').bind(user.id, placeId),
        env.DB.prepare('UPDATE users SET data_version = data_version + 1 WHERE id = ?').bind(user.id),
      ]);
      await env.PHOTOS.delete(stampPhotoKey(user.id, placeId));
      return json(request, env, { ok: true });
    }
  }

  return null;
}

async function handle(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    if (request.headers.get('Origin') && !allowedOrigin(request, env)) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  const path = new URL(request.url).pathname.replace(/\/$/, '') || '/';
  if (path === '/api/health' && request.method === 'GET') {
    return json(request, env, { ok: true, service: 'stampquest-api' });
  }
  const mediaResponse = await handleMedia(request, env, path);
  if (mediaResponse) return mediaResponse;
  const authResponse = await handleAuth(request, env, path);
  if (authResponse) return authResponse;
  const placesResponse = await handlePlaces(request, env, path);
  if (placesResponse) return placesResponse;
  return json(request, env, { error: 'NOT_FOUND' }, 404);
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await handle(request, env);
    } catch (error) {
      if (String(error).includes('BODY_TOO_LARGE')) {
        return json(request, env, { error: 'PAYLOAD_TOO_LARGE' }, 413);
      }
      console.error('StampQuest Worker error', error);
      return json(request, env, { error: 'INTERNAL_ERROR' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
