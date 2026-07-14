# StampQuest 🗺️

A mobile-first web app where you collect digital stamps from places you visit and build a personal travel passport. Get within 500 m of a landmark, tap **Collect stamp**, and it's inked into your passport forever — then take or upload a photo of the place and it becomes the stamp's artwork.

| Passport | Browse nearby | Add your photo | Collect with a photo |
| --- | --- | --- | --- |
| ![Passport grid](docs/passport.png) | ![Explore list](docs/explore.png) | ![Stamp detail](docs/detail.png) | ![Photo-evidence collection](docs/photo-evidence.png) |

## Features

- **GPS check-in** — the Collect button unlocks only when you're physically near a place; the server re-validates the distance, so the client can't be trivially spoofed.
- **Remote collection with photo evidence** — no GPS needed: upload a photo you already have of the place. It's accepted if the photo's own EXIF location is near the place, or (with photo verification configured) if the photo visibly shows the landmark.
- **Your photo is the stamp** — every stamp starts as a blank frame; the first photo you add for a place — from collecting in person or via photo evidence — becomes that stamp's artwork, inside the same vintage postage-stamp frame.
- **281 curated world landmarks** spanning Asia, Europe, the Americas, Africa, and Oceania — including one iconic stop in each of the 50 U.S. states — each rendered in a shared vintage-poster frame (procedural SVG — deterministic per place, zero stored images) until you fill it with your own photo.
- **Custom places** — add your own spots (café, trailhead, rooftop) from the floating **+** button, wherever you are in the app; each gets a generated stamp in the same style. Private to your account.
- **Simple accounts** — sign up with just a username and password. Your stamps, custom places, and photos are private to your account; no third-party sign-in required.
- **Profile photo** — tap your avatar in the top-right corner or on the profile tab to add or replace your profile picture.
- **Home landing page** — a stats strip (stamps, countries, continents traveled) up top, then three cards — Landmarks, Cities, US States — each opening into its own browsing page, reached only from here.
- **Browse by Landmarks, Cities, or US States** — each category page offers a **card or map view** (the map is a real pannable/zoomable Leaflet map with OpenStreetMap tiles, lazy-loaded so it never costs anyone who stays on card view), plus its own search.
- **Metric or imperial** — a units toggle on your profile switches every distance in the app (collect radius, "how far away," photo-match radius) between the two, remembered per device.
- **Personal passport** — your home page's stats strip tracks stamps, countries, and continents traveled; your profile shows a 3-column gallery of everything you've collected plus the custom places you've added.
- **Globe-trotting intro** — a one-time animated splash (spinning globe, orbiting plane, landmarks lighting up across every continent) plays when you enter the app, then fades into your passport underneath.
- **Installable PWA** — add to home screen, standalone display, offline app shell.
- **Self-contained backend** — Node + Express + SQLite in this repo. No third-party services required.

## Stack

- `client/` — Vite, React 19, TypeScript, Tailwind CSS v4, react-router, vite-plugin-pwa, `framer-motion` for animation, `leaflet`/`react-leaflet` for the map view (code-split, only loaded when opened), `exifr` for reading a photo's embedded GPS
- `server/` — Express 5, better-sqlite3, session cookies (httpOnly), scrypt password hashing via `node:crypto`, optional Gemini/Hugging Face vision check for photo-evidence collection
- `e2e/` — Playwright suite with mocked geolocation at phone viewport

## Quickstart

```bash
npm install
npm run dev
```

- App: http://localhost:5173 (Vite dev server, proxies `/api` to the API on :3001)
- The SQLite database is created and seeded automatically at `server/data/stampquest.db`.

> **Testing on a real phone:** browser geolocation only works in secure contexts — `localhost` is exempt, but a LAN IP (`http://192.168.x.x:5173`) is not. Use an HTTPS tunnel (e.g. `cloudflared tunnel`, `ngrok`) or deploy. On iOS, location is only requested after a button tap (by design).

## Production

```bash
npm run build
NODE_ENV=production PORT=3001 npm start
```

One process serves everything: the built client, the SPA fallback, and the `/api` routes.

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | HTTP port |
| `DATABASE_PATH` | `server/data/stampquest.db` | SQLite file location |
| `NODE_ENV` | — | `production` enables `Secure` session cookies (requires HTTPS) |
| `GOOGLE_API_KEY` | — | Optional. Gemini API key — primary provider for the landmark-recognition path in photo-evidence collection. |
| `GOOGLE_MODEL` | `gemini-2.0-flash` | Gemini model used for the landmark vision check |
| `HUGGINGFACE_API_KEY` | — | Optional. Secondary/fallback vision provider, used if Gemini is unset or a request to it fails. |
| `HUGGINGFACE_MODEL` | `Qwen/Qwen2-VL-72B-Instruct` | Hugging Face model used for the fallback landmark vision check |

**Deploying free:** the app is a single Node service, so Render/Fly.io/Railway free tiers all work. Two things to remember: (1) point `DATABASE_PATH` at a **persistent disk/volume** — ephemeral filesystems reset the database on every deploy; (2) serve over **HTTPS**, or geolocation (and Secure cookies) won't work.

### GitHub Pages (static demo mode)

Every push to the default branch runs `.github/workflows/deploy-pages.yml`, which publishes a static build to **https://shrlak.github.io/passport/**.

GitHub Pages can't run the Node API, so this build swaps in a browser backend (`VITE_BACKEND=local`): you're auto-signed in as a local traveler, and stamps + custom places (plus their photos, in IndexedDB) are stored on the device (no accounts, no cross-device sync; the 500 m / photo-radius checks run client-side). Photo evidence works via EXIF GPS matching only — the landmark vision check needs a server and Anthropic API key, so it's unavailable in this build. Everything else is identical — and since Pages serves over HTTPS, GPS collecting and PWA install work great on phones.

The workflow publishes the build to a `gh-pages` branch, which GitHub picks up automatically. If the site doesn't appear after the first successful run, enable it once by hand — repo **Settings → Pages → Deploy from a branch → `gh-pages` / root** — later deploys are automatic.

To try the static build locally: `VITE_BACKEND=local npm run build -w client && npm run preview -w client`.

## How collecting works

1. The client asks for your position (only ever after a button tap).
2. `POST /api/places/:id/collect` sends your coordinates.
3. The server computes the Haversine distance to the place and rejects anything over **500 m** (`403 TOO_FAR`), duplicates (`409 ALREADY_COLLECTED`), and places you can't see (`404`).
4. The stamp row stores when and roughly where you collected it.

The radius lives in `server/src/geo.ts` (authoritative) and is mirrored in `client/src/lib/geo.ts` (UI gating only). This is honor-system-hardened, not fraud-proof — device-level GPS spoofing is out of scope.

### Collecting remotely, with a photo

On any place you haven't collected yet, the detail page offers **"Collect with a photo"** — for the landmarks you've already visited, or ones you have an old photo of. `POST /api/places/:id/collect-photo` accepts the image and grants the stamp if either check passes:

1. **EXIF GPS match** — the client reads the photo's embedded location (`client/src/lib/exif.ts`, via `exifr`) and sends it alongside the image. If it's within **5 km** of the place (`PHOTO_RADIUS_M` in `server/src/geo.ts` — more generous than live GPS, since landmark photos are often taken from a viewpoint some distance away), the stamp is granted immediately.
2. **Landmark recognition** — if there's no usable EXIF location (or it doesn't match) and `ANTHROPIC_API_KEY` is configured, the server asks Claude's vision (`server/src/landmark.ts`) whether the photo actually shows that place's landmark or an unmistakable famous feature of it. A confident match grants the stamp.

Either way, the uploaded photo becomes the stamp's artwork — same as collecting in person and adding a photo afterward. Without either vision provider configured, only the EXIF path is available, and the UI explains that when a photo is rejected for having no location data.

## Navigation

Signed-in visitors land on the home page: a stats strip, then three cards — **Landmarks**, **Cities**, **US States**. Tapping a card opens that category's own page (with a back chevron to return home); it isn't reachable any other way. Two things stay on screen everywhere in the app: your profile avatar, top-right, and a circular **+** button, bottom-center, which pops up the add-a-place form without leaving the page you're on.

## Browsing by category

The curated roster is tagged with a `category` — `landmark`, `city`, or `us-state`. Custom places you add default to `landmark`. Each category page offers:

- **Card view** — the same 2-column stamp grid as your passport (collected stamps in color, locked ones grayscale), sorted by distance once you've granted location, alphabetical otherwise.
- **Map view** — a real Leaflet map with OpenStreetMap tiles and a pin per place; tap a pin to jump to that place's detail page. The map library is dynamically imported, so it only downloads if you actually open map view.

## Units

A Metric/Imperial toggle on the profile page (persisted in `localStorage`) controls every distance shown in the app — the collect radius, "how far away you are," and the photo-match radius. The underlying constants (`COLLECT_RADIUS_M`, `PHOTO_RADIUS_M`) and all server-side distance math stay in meters regardless; this only changes display formatting.

## Data model

- `users` — username (unique, 3–24 chars), scrypt password hash, plus an optional profile `photo` BLOB (`photo_mime`, `photo_updated_at`), served via `GET /api/auth/me/photo`
- `sessions` — random 32-byte tokens, 30-day expiry, httpOnly cookie
- `places` — curated seed (`is_curated=1`, `art_key` → client art registry) or user-created (`created_by`, private to creator), tagged with a `category`
- `stamps` — `UNIQUE(user_id, place_id)`, collection time + coordinates + distance, plus an optional `photo` BLOB (`photo_mime`, `photo_updated_at`) — the user's own photo of the place, served via `GET /api/places/:id/photo`

The schema is applied idempotently on boot (including an additive migration for the `category` column on pre-existing databases); the 281 landmarks seed automatically into an empty database.

## Tests

```bash
npx playwright install chromium   # once
npm run e2e
```

The suite builds the client, boots the server on a throwaway database (with `GOOGLE_API_KEY`/`HUGGINGFACE_API_KEY` unset, so the landmark-recognition path is deterministically off), and drives the real app at 390×844 with mocked geolocation: registration → home landing page (stats strip, category cards) → the Landmarks card's card and map views → in-range detection at the Eiffel Tower → collect → add a photo, which becomes the stamp art → persistence across reload → the Cities and US States cards → custom place creation via the floating **+** button → the profile's collected-stamps gallery, units toggle, and profile-photo upload → **server-side rejection of far-away coordinates** → **remote collection via matching photo EXIF GPS**, plus rejection of a too-far or location-less photo → auth and privacy checks.

## Stamp art

Every stamp's frame — perforated edges, palette, caption band — is generated deterministically from the place's identity (an FNV-1a hash picks the palette, denomination, and album tilt). The frame starts **blank**: a locked stamp is grayscale with a lock icon, and a collected-but-photo-less stamp shows a dashed outline with a camera icon, waiting for your photo. Once you add one — by taking/uploading a photo after collecting, or via photo-evidence collection — it fills the frame as the stamp's artwork. The original procedural landmark illustrations (hand-authored silhouette paths in `client/src/art/landmarks.ts`, motifs in `client/src/art/motifs.ts`) still exist and render on the auth screen and the hidden `/gallery` QA sheet, which is the place to look if you want to see the full illustrated set.

App icons are rendered from the same design language: `npm run gen-icons` (requires Playwright's chromium).
