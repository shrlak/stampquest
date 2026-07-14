import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const NYC = { latitude: 40.7128, longitude: -74.006 };
const shot = (name: string) => fileURLToPath(new URL(`screenshots/${name}.png`, import.meta.url));

// Keep in sync with the curated roster in server/src/seed.ts.
const CURATED_COUNT = 329;

// One account shared across the serial suite. Usernames are letters/digits/underscore only.
const username = `e2e_${Date.now()}`;
const password = 'wanderlust1';

// 1×1 PNG — enough for the canvas-downscale → upload pipeline.
const TEST_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test.describe.configure({ mode: 'serial' });

test('register, collect at the Eiffel Tower, add a custom place', async ({ page }) => {
  // Protected routes always return unauthenticated visitors to the account gate.
  await page.goto('/');
  await expect(page).toHaveURL(/\/auth$/);
  await page.screenshot({ path: shot('01-auth') });

  // register (auto-login, no email confirmation)
  await page.getByText('New here? Create an account').click();
  await page.getByTestId('auth-username').fill(username);
  await page.getByTestId('auth-password').fill(password);
  await page.getByTestId('auth-submit').click();

  // home landing page: stats strip + three category cards
  await expect(page.getByTestId('stats-strip')).toBeVisible();
  await expect(page.getByTestId('stats-strip')).toContainText(`0 / ${CURATED_COUNT}`);
  await expect(page.getByTestId('home-card-landmark')).toBeVisible();
  await expect(page.getByTestId('home-card-city')).toBeVisible();
  await expect(page.getByTestId('home-card-us-state')).toBeVisible();
  await page.screenshot({ path: shot('02-home'), fullPage: true });

  // landmarks card opens the Landmarks page, reachable only from here
  await page.getByTestId('home-card-landmark').click();
  await expect(page.getByTestId('back-button')).toBeVisible();
  await expect(page.getByTestId('landmark-cards')).toBeVisible();
  await expect(
    page.locator('[data-testid="landmark-cards"] [data-testid="stamp-card"]'),
  ).toHaveCount(203);
  await page.screenshot({ path: shot('03-landmarks') });

  // map view renders for the same category
  await page.getByTestId('landmark-view-map').click();
  await expect(page.getByTestId('landmark-map')).toBeVisible();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await page.getByTestId('landmark-view-cards').click();
  await expect(page.getByTestId('landmark-cards')).toBeVisible();

  // find and collect the Eiffel Tower
  await page.getByTestId('landmark-search').fill('Eiffel');
  await page.locator('[data-testid="landmark-cards"] [data-testid="stamp-card"]').first().click();
  const eiffelUrl = page.url();
  await page.getByTestId('enable-location').click();
  await page.getByTestId('collect-button').click();
  await expect(page.getByTestId('collected-line')).toContainText(
    'you added the Eiffel Tower stamp to your collection',
  );
  await page.screenshot({ path: shot('04-collected') });

  // Collected stamps keep their built-in art and translucent lock until the
  // traveler personalizes them; tapping the stamp is the primary upload path.
  await expect(page.getByTestId('stamp-photo')).toHaveCount(0);
  await expect(page.getByTestId('stamp-illustration')).toBeVisible();
  await expect(page.getByTestId('stamp-lock')).toBeVisible();
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
  await expect(page.getByTestId('stamp-illustration')).toHaveCount(0);
  await expect(page.getByTestId('stamp-lock')).toHaveCount(0);

  // A full browser refresh returns to the landing page, while the server-side
  // stamp and photo still persist when the place is reopened.
  await page.reload();
  await expect(page.getByTestId('stats-strip')).toContainText(`1 / ${CURATED_COUNT}`);
  await expect(page).toHaveURL(/\/$/);
  await page.goto(eiffelUrl);
  await expect(page.getByTestId('collected-line')).toBeVisible();
  await expect(page.getByTestId('stamp-photo')).toBeVisible();
  await expect(page.getByTestId('stamp-lock')).toHaveCount(0);

  // home reflects the collection
  await page.getByTestId('topbar-home').click();
  await expect(page.getByTestId('stats-strip')).toContainText(`1 / ${CURATED_COUNT}`);
  await page.screenshot({ path: shot('05-home-collected'), fullPage: true });

  // cities and US states cards are separately browsable
  await page.getByTestId('home-card-city').click();
  await expect(page.getByTestId('city-cards')).toBeVisible();
  await expect(
    page.locator('[data-testid="city-cards"] [data-testid="stamp-card"]'),
  ).toHaveCount(76);
  await page.getByTestId('back-button').click();
  await page.getByTestId('home-card-us-state').click();
  await expect(page.getByTestId('us-state-cards')).toBeVisible();
  await expect(
    page.locator('[data-testid="us-state-cards"] [data-testid="stamp-card"]'),
  ).toHaveCount(50);
  await page.getByTestId('us-state-search').fill('Alabama');
  await expect(page.getByTestId('state-name')).toHaveText('Alabama');
  await page.getByTestId('back-button').click();

  // custom place via the floating Add button, at current location, then collect it
  await page.getByTestId('add-fab').click();
  await expect(page.getByTestId('add-place-modal')).toBeVisible();
  await page.getByTestId('place-name').fill('Café de Flore');
  await page.getByTestId('place-country').fill('France');
  await page.getByTestId('use-my-location').click();
  await expect(page.getByTestId('use-my-location')).toContainText('Using your location');
  await page.getByTestId('save-place').click();
  await expect(page.getByTestId('add-place-modal')).toHaveCount(0);
  await page.getByTestId('collect-button').click();
  await expect(page.getByTestId('collected-line')).toContainText('Café de Flore');

  // stats: 2 stamps, 1 country (both France)
  await page.getByTestId('topbar-home').click();
  await expect(page.getByTestId('stats-strip')).toContainText(`2 / ${CURATED_COUNT + 1}`);

  // profile: reached via the top-right avatar; collected-stamps gallery, units toggle,
  // "My places" list, and a profile-photo upload
  await page.getByTestId('topbar-profile').click();
  await expect(page.getByTestId('collected-grid')).toBeVisible();
  await expect(page.locator('[data-testid="collected-grid"] [data-testid="stamp-card"]')).toHaveCount(2);
  await expect(page.getByText('My places')).toBeVisible();
  await page.getByTestId('units-imperial').click();

  await expect(page.getByTestId('profile-photo-tap-target')).toBeVisible();
  const avatarChooser = page.waitForEvent('filechooser');
  await page.getByTestId('profile-photo-tap-target').click();
  const avatarFile = await avatarChooser;
  await avatarFile.setFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: Buffer.from(TEST_PNG_BASE64, 'base64'),
  });
  await expect(page.locator('[data-testid="profile-photo-tap-target"] img')).toBeVisible();
  await expect(page.locator('[data-testid="topbar-profile"] img')).toBeVisible();
  await page.screenshot({ path: shot('06-profile') });

  // Refresh returns home; reopening Profile confirms the server-side avatar
  // still persists rather than depending on page state.
  await page.reload();
  await expect(page.getByTestId('stats-strip')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await page.getByTestId('topbar-profile').click();
  await expect(page.locator('[data-testid="profile-photo-tap-target"] img')).toBeVisible();

  // Sign-out closes the account session and restores the login gate.
  await page.getByTestId('sign-out').click();
  await expect(page).toHaveURL(/\/auth$/);
});

test('proximity is enforced server-side, not just in the UI', async ({ page, context }) => {
  // sign in fresh (also exercises the login flow)
  await page.goto('/auth');
  await page.getByTestId('auth-username').fill(username);
  await page.getByTestId('auth-password').fill(password);
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('stats-strip')).toBeVisible();

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
  await page.getByTestId('auth-username').fill(username);
  await page.getByTestId('auth-password').fill(password);
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('stats-strip')).toBeVisible();

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
      username: `e2e_other_${Date.now()}`,
      password: 'wanderlust2',
    },
  });
  expect(other.status()).toBe(201);
  const { places } = (await (await request.get('/api/places')).json()) as {
    places: { name: string }[];
  };
  expect(places).toHaveLength(CURATED_COUNT);
  expect(places.some((p) => p.name === 'Café de Flore')).toBe(false);
});
