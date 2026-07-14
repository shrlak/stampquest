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

// 2×2 JPEG with EXIF GPS at the Eiffel Tower (48.8584, 2.2945).
const TEST_GPS_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/4QCIRXhpZgAATU0AKgAAAAgAAYglAAQAAAABAAAAGgAAAAAABAABAAIAAAACTgAAAAACAAUAAAADAAAAUAADAAIAAAACRQAAAAAEAAUAAAADAAAAaAAAAAAAAAAwAAAAAQAAADMAAAABAAAC9AAAABkAAAACAAAAAQAAABEAAAABAAAAyQAAAAX/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDRooor54+vP//Z';

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

  // Location is requested once, immediately after authentication, then kept
  // for the account until sign-out instead of being requested place by place.
  await expect(page.getByTestId('location-onboarding')).toBeVisible();
  await expect(page.getByTestId('location-status')).toHaveAttribute('aria-label', 'Location pending');
  await expect(page.getByTestId('location-status')).toHaveCSS('background-color', 'rgb(255, 159, 10)');
  await page.getByTestId('location-enable').click();
  await expect(page.getByTestId('location-onboarding')).toHaveCount(0);
  await expect(page.getByTestId('location-status')).toHaveAttribute('aria-label', 'Location available');
  await expect(page.getByTestId('location-status')).toHaveCSS('background-color', 'rgb(52, 199, 89)');
  await expect(page.getByTestId('topbar-home')).not.toContainText('Location ready');

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
  await expect(page.getByTestId('location-onboarding')).toHaveCount(0);
  await expect(page.getByTestId('location-status')).toHaveAttribute('aria-label', 'Location available');
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

  // Category inference uses the typed identity of the custom place, while
  // catalog-backed confirmation keeps this deterministic and off the network.
  const classifications = await page.evaluate(async () => {
    const resolve = async (name: string, location: string, country: string) => {
      const response = await fetch('/api/places/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, location, country }),
      });
      return response.json();
    };
    return {
      landmark: await resolve('Eiffel Tower View', 'Paris', 'France'),
      city: await resolve('Paris Memory', 'Paris', 'France'),
      state: await resolve('Texas Journey', 'Texas', 'United States'),
    };
  });
  expect(classifications.landmark.location.category).toBe('landmark');
  expect(classifications.city.location.category).toBe('city');
  expect(classifications.state.location.category).toBe('us-state');
  expect(classifications.state.location.stateName).toBe('Texas');

  // Custom-place creation has one automatic flow: photo EXIF is the primary
  // coordinate source, and the typed place must confirm that GPS. There are
  // no source selectors or manual coordinate fields.
  await page.getByTestId('add-fab').click();
  await expect(page.getByTestId('add-place-modal')).toBeVisible();
  await expect(page.getByTestId('automatic-location')).toBeVisible();
  await expect(page.getByText('Photo GPS is used first')).toBeVisible();
  await expect(page.getByTestId('lookup-location')).toHaveCount(0);
  await expect(page.getByTestId('manual-lat')).toHaveCount(0);
  await page.getByTestId('place-name').fill('Paris Memory');
  await page.getByTestId('place-location-hint').fill('New York City');
  await page.getByTestId('place-country').fill('United States');
  await page.getByTestId('place-photo-input').setInputFiles({
    name: 'paris-gps.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(TEST_GPS_JPEG_BASE64, 'base64'),
  });
  await expect(page.getByTestId('photo-location-status')).toContainText('GPS found');

  // A mismatched typed location is rejected instead of silently replacing the
  // photo coordinates.
  await page.getByTestId('save-place').click();
  await expect(page.getByTestId('add-place-error')).toContainText('does not match');
  await page.getByTestId('place-location-hint').fill('Paris');
  await page.getByTestId('place-country').fill('France');
  await page.getByTestId('save-place').click();
  await expect(page.getByTestId('add-place-modal')).toHaveCount(0);
  await page.getByTestId('collect-button').click();
  await expect(page.getByTestId('collected-line')).toContainText('Paris Memory');

  // stats: 2 stamps, 1 country (both France)
  await page.getByTestId('topbar-home').click();
  await expect(page.getByTestId('stats-strip')).toContainText(`2 / ${CURATED_COUNT + 1}`);

  // The inferred city category places the custom stamp in Cities, without the
  // traveler selecting a category themselves.
  await page.getByTestId('home-card-city').click();
  await page.getByTestId('city-search').fill('Paris Memory');
  await expect(
    page.locator('[data-testid="city-cards"] [data-testid="stamp-card"]'),
  ).toHaveCount(1);
  await expect(page.getByText('Paris Memory')).toBeVisible();
  await page.getByTestId('back-button').click();

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
  expect(
    await page.evaluate(() => localStorage.getItem('stampquest.location-session.v1')),
  ).toBeNull();
});

test('proximity is enforced server-side, not just in the UI', async ({ page, context }) => {
  // sign in fresh (also exercises the login flow)
  await context.setGeolocation(NYC);
  await page.goto('/auth');
  await page.getByTestId('auth-username').fill(username);
  await page.getByTestId('auth-password').fill(password);
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('location-onboarding')).toBeVisible();
  await page.getByTestId('location-enable').click();
  await expect(page.getByTestId('location-onboarding')).toHaveCount(0);
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
  await page.goto(`/place/${result.placeId}`);
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
  await expect(page.getByTestId('location-onboarding')).toBeVisible();
  await page.getByTestId('location-skip').click();
  await expect(page.getByTestId('location-onboarding')).toHaveCount(0);
  await expect(page.getByTestId('location-status')).toHaveAttribute('aria-label', 'Location unavailable');
  await expect(page.getByTestId('location-status')).toHaveCSS('background-color', 'rgb(255, 59, 48)');
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
  expect(places.some((p) => p.name === 'Paris Memory')).toBe(false);
});
