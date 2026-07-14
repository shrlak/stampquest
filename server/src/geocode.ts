export interface GeocodeMatch {
  lat: number;
  lng: number;
  label: string;
  source: 'openstreetmap';
}

interface NominatimResult {
  lat?: unknown;
  lon?: unknown;
  display_name?: unknown;
}

const cache = new Map<string, GeocodeMatch | null>();
let queue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function remember(key: string, value: GeocodeMatch | null) {
  cache.set(key, value);
  // Keep the in-memory cache bounded on long-running installs.
  if (cache.size > 500) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest) cache.delete(oldest);
  }
}

async function requestNominatim(query: string): Promise<GeocodeMatch | null> {
  const endpoint = new URL(
    process.env.GEOCODER_URL ?? 'https://nominatim.openstreetmap.org/search',
  );
  endpoint.searchParams.set('q', query);
  endpoint.searchParams.set('format', 'jsonv2');
  endpoint.searchParams.set('limit', '1');
  endpoint.searchParams.set('addressdetails', '0');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
        'User-Agent':
          process.env.GEOCODER_USER_AGENT ??
          'StampQuest/0.1 (+https://github.com/shrlak/passport)',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);

    const body = (await response.json()) as unknown;
    const first = Array.isArray(body) ? (body[0] as NominatimResult | undefined) : undefined;
    const lat = Number(first?.lat);
    const lng = Number(first?.lon);
    if (
      !first ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      return null;
    }
    return {
      lat,
      lng,
      label:
        typeof first.display_name === 'string' && first.display_name.trim()
          ? first.display_name.trim()
          : query,
      source: 'openstreetmap',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * One user-triggered lookup at a time, with a one-second gap between public
 * Nominatim requests and an application-side cache as required by its policy.
 */
export async function geocode(query: string): Promise<GeocodeMatch | null> {
  const key = query.trim().toLocaleLowerCase('en');
  if (cache.has(key)) return cache.get(key) ?? null;

  let release: (() => void) | undefined;
  const previous = queue;
  queue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;

  try {
    // A duplicate may have been resolved while this call waited in the queue.
    if (cache.has(key)) return cache.get(key) ?? null;
    const remaining = 1_000 - (Date.now() - lastRequestAt);
    if (remaining > 0) await delay(remaining);
    lastRequestAt = Date.now();
    const match = await requestNominatim(query);
    remember(key, match);
    return match;
  } finally {
    release?.();
  }
}
