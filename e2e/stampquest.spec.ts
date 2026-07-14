import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const NYC = { latitude: 40.7128, longitude: -74.006 };
const shot = (name: string) => fileURLToPath(new URL(`screenshots/${name}.png`, import.meta.url));

// Keep in sync with the curated roster in server/src/seed.ts.
const CURATED_COUNT = 133;

// One account shared across the serial suite.
const email = `e2e-${Date.now()}@example.com`;
const password = 'wanderlust1';

// 1×1 PNG — enough for the canvas-downscale → upload pipeline.
const TEST_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test.describe.configure({ mode: 'serial' });

test('register, collect at the Eiffel Tower, add a custom place', async ({ page }) => {
  await page.goto('/auth');
  await page.screenshot({ path: shot('01-auth') });

  // register (auto-login, no email confirmation)
  await page.getByText('New here? Create an account').click();
  await page.getByPlaceholder('Display name').fill('Spencer');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password (8+ characters)').fill(password);
  await page.getByTestId('auth-submit').click();

  // passport: curated stamps, all locked
  await expect(page.getByTestId('passport-grid')).toBeVisible();
  await expect(page.getByTestId('stamp-card')).toHaveCount(CURATED_COUNT);
  await expect(page.locator('[data-testid="stamp-card"][data-collected="true"]')).toHaveCount(0);
  await expect(page.getByTestId('stats-strip')).toContainText(`0 / ${CURATED_COUNT}`);
  await page.screenshot({ path: shot('02-passport-locked'), fullPage: true });

  // explore: location sorts Eiffel Tower first and in range
  await page.getByRole('link', { name: 'Explore' }).click();
  await page.getByTestId('enable-location').click();
  const firstRow = page.locator('[data-testid="explore-list"] a').first();
  await expect(firstRow).toContainText('Eiffel Tower');
  await expect(firstRow).toContainText('In range');
  await page.screenshot({ path: shot('03-explore') });

  // collect
  await firstRow.click();
  await page.getByTestId('collect-button').click();
  await expect(page.getByTestId('collected-line')).toContainText(
    'you added the Eiffel Tower stamp to your collection',
  );
  await page.screenshot({ path: shot('04-collected') });

  // the stamp starts blank — tapping it is the primary way to add a photo
  await expect(page.getByTestId('stamp-photo')).toHaveCount(0);
  await expect(page.getByTestId('stamp-photo-tap-target')).toBeVisible();
  const uploadChooser = page.waitForEvent('filechooser');
  await page.getByTestId('stamp-photo-tap-target').click();
  const chooser = await uploadChooser;
  await chooser.setFiles({
    name: 'eiffel.png',
    mimeType: 'image/png',
    buffer: Buffer.from(TEST_PNG_BASE64, 'base64'),
  });
  await expect(page.getByTestId('stamp-photo')).toBeVisible();

  // persistence: survives a full reload (server-side stamp + photo, not client state)
  await page.reload();
  await expect(page.getByTestId('collected-line')).toBeVisible();
  await expect(page.getByTestId('stamp-photo')).toBeVisible();

  // passport reflects the collection
  await page.getByRole('link', { name: 'Passport' }).click();
  await expect(page.locator('[data-testid="stamp-card"][data-collected="true"]')).toHaveCount(1);
  await expect(page.getByTestId('stats-strip')).toContainText(`1 / ${CURATED_COUNT}`);
  await page.screenshot({ path: shot('05-passport-collected'), fullPage: true });

  // custom place at current location, then collect it
  await page.getByRole('link', { name: 'Add' }).click();
  await page.getByTestId('place-name').fill('Café de Flore');
  await page.getByTestId('place-country').fill('France');
  await page.getByTestId('use-my-location').click();
  await expect(page.getByTestId('use-my-location')).toContainText('Using your location');
  await page.getByTestId('save-place').click();
  await page.getByTestId('collect-button').click();
  await expect(page.getByTestId('collected-line')).toContainText('Café de Flore');

  // stats: 2 stamps, 1 country (both France); custom grid appears
  await page.getByRole('link', { name: 'Passport' }).click();
  await expect(page.getByTestId('my-places-grid')).toBeVisible();
  await expect(page.getByTestId('stats-strip')).toContainText(`2 / ${CURATED_COUNT + 1}`);
  await page.getByRole('link', { name: 'Profile' }).click();
  await expect(page.getByText('stamps')).toBeVisible();
  await page.screenshot({ path: shot('06-profile') });
});

test('proximity is enforced server-side, not just in the UI', async ({ page, context }) => {
  // sign in fresh (also exercises the login flow)
  await page.goto('/auth');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password (8+ characters)').fill(password);
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('passport-grid')).toBeVisible();

  // bypass the UI: POST NYC coordinates for the Colosseum directly
  const result = await page.evaluate(async (coords) => {
    const { places } = await (await fetch('/api/places')).json();
    const colosseum = places.find((p: { artKey: string }) => p.artKey === 'colosseum');
    const res = await fetch(`/api/places/${colosseum.id}/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(coords),
    });
    return { status: res.status, body: await res.json(), placeId: colosseum.id as string };
  }, { lat: NYC.latitude, lng: NYC.longitude });

  expect(result.status).toBe(403);
  expect(result.body.error).toBe('TOO_FAR');
  expect(result.body.distanceM).toBeGreaterThan(1_000_000);

  // and the UI mirrors it: from NYC the button is disabled with the distance shown
  await context.setGeolocation(NYC);
  await page.goto(`/place/${result.placeId}`);
  await page.getByTestId('enable-location').click();
  await expect(page.getByTestId('collect-button')).toBeDisabled();
  await expect(page.getByTestId('too-far-line')).toContainText('Get within 500 m');
  await page.screenshot({ path: shot('07-too-far') });
});

test('a photo with matching EXIF location collects a stamp remotely', async ({ page }) => {
  // still signed in as the suite account, geolocation mocked to Paris
  await page.goto('/auth');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password (8+ characters)').fill(password);
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('passport-grid')).toBeVisible();

  const png = `data:image/png;base64,${TEST_PNG_BASE64}`;
  const result = await page.evaluate(async (photo) => {
    const { places } = await (await fetch('/api/places')).json();
    const taj = places.find((p: { artKey: string }) => p.artKey === 'tajmahal');
    const petra = places.find((p: { artKey: string }) => p.artKey === 'petra');
    const post = async (id: string, body: Record<string, unknown>) => {
      const res = await fetch(`/api/places/${id}/collect-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json() };
    };
    return {
      // photo "taken at" the Taj Mahal → granted despite being in Paris
      granted: await post(taj.id, { photo, photoLat: 27.1745, photoLng: 78.0418 }),
      // photo taken ~200 km away → rejected
      far: await post(petra.id, { photo, photoLat: 32.0, photoLng: 35.5 }),
      // no EXIF location and no landmark check configured → rejected
      none: await post(petra.id, { photo }),
    };
  }, png);

  expect(result.granted.status).toBe(201);
  expect(result.granted.body.verifiedBy).toBe('photo-gps');
  expect(result.far.status).toBe(403);
  expect(result.far.body.error).toBe('PHOTO_TOO_FAR');
  expect(result.none.status).toBe(403);
  expect(result.none.body.error).toBe('PHOTO_NO_LOCATION');

  // the granted stamp appears collected, with the photo as its art
  await page.goto(`/place/${result.granted.body.stamp.placeId}`);
  await expect(page.getByTestId('collected-line')).toBeVisible();
  await expect(page.getByTestId('stamp-photo')).toBeVisible();
});

test('API rejects unauthenticated requests', async ({ request }) => {
  const res = await request.get('/api/places');
  expect(res.status()).toBe(401);
  const collect = await request.post('/api/places/whatever/collect', {
    data: { lat: 0, lng: 0 },
  });
  expect(collect.status()).toBe(401);
});

test('custom places are private to their creator', async ({ request }) => {
  const other = await request.post('/api/auth/register', {
    data: {
      email: `e2e-other-${Date.now()}@example.com`,
      password: 'wanderlust2',
      displayName: 'Other',
    },
  });
  expect(other.status()).toBe(201);
  const { places } = (await (await request.get('/api/places')).json()) as {
    places: { name: string }[];
  };
  expect(places).toHaveLength(CURATED_COUNT);
  expect(places.some((p) => p.name === 'Café de Flore')).toBe(false);
});
