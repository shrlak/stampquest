# StampQuest 🗺️

A mobile-first web app where you collect digital stamps from places you visit and build a personal travel passport. Get within 500 m of a landmark, tap **Collect stamp**, and it's inked into your passport forever.

| Passport | Explore nearby | Collected |
| --- | --- | --- |
| ![Passport grid](docs/passport.png) | ![Explore list](docs/explore.png) | ![Stamp detail](docs/detail.png) |

## Features

- **GPS check-in** — the Collect button unlocks only when you're physically near a place; the server re-validates the distance, so the client can't be trivially spoofed.
- **24 curated world landmarks**, each with hand-crafted vintage-poster stamp art (procedural SVG — deterministic per place, zero stored images).
- **Custom places** — add your own spots (café, trailhead, rooftop); each gets a generated stamp in the same style. Private to your account.
- **Personal passport** — 2-column stamp album: collected stamps in color, locked ones grayscale; stats for stamps and countries.
- **Installable PWA** — add to home screen, standalone display, offline app shell.
- **Self-contained backend** — Node + Express + SQLite in this repo. No third-party services, completely free to run.

## Stack

- `client/` — Vite, React 19, TypeScript, Tailwind CSS v4, react-router, vite-plugin-pwa
- `server/` — Express 5, better-sqlite3, session cookies (httpOnly), scrypt password hashing via `node:crypto`
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

**Deploying free:** the app is a single Node service, so Render/Fly.io/Railway free tiers all work. Two things to remember: (1) point `DATABASE_PATH` at a **persistent disk/volume** — ephemeral filesystems reset the database on every deploy; (2) serve over **HTTPS**, or geolocation (and Secure cookies) won't work.

### GitHub Pages (static demo mode)

Every push to the default branch runs `.github/workflows/deploy-pages.yml`, which publishes a static build to **https://shrlak.github.io/passport/**.

GitHub Pages can't run the Node API, so this build swaps in a browser backend (`VITE_BACKEND=local`): you're auto-signed in as a local traveler, and stamps + custom places are stored in `localStorage` on the device (no accounts, no cross-device sync; the 500 m check runs client-side). Everything else is identical — and since Pages serves over HTTPS, GPS collecting and PWA install work great on phones.

The workflow tries to enable Pages automatically on first deploy. If that run fails with a Pages/permissions error, enable it once by hand — repo **Settings → Pages → Source: GitHub Actions** — then re-run the workflow.

To try the static build locally: `VITE_BACKEND=local npm run build -w client && npm run preview -w client`.

## How collecting works

1. The client asks for your position (only ever after a button tap).
2. `POST /api/places/:id/collect` sends your coordinates.
3. The server computes the Haversine distance to the place and rejects anything over **500 m** (`403 TOO_FAR`), duplicates (`409 ALREADY_COLLECTED`), and places you can't see (`404`).
4. The stamp row stores when and roughly where you collected it.

The radius lives in `server/src/geo.ts` (authoritative) and is mirrored in `client/src/lib/geo.ts` (UI gating only). This is honor-system-hardened, not fraud-proof — device-level GPS spoofing is out of scope.

## Data model

- `users` — email (unique), scrypt password hash, display name
- `sessions` — random 32-byte tokens, 30-day expiry, httpOnly cookie
- `places` — curated seed (`is_curated=1`, `art_key` → client art registry) or user-created (`created_by`, private to creator)
- `stamps` — `UNIQUE(user_id, place_id)`, collection time + coordinates + distance

The schema is applied idempotently on boot; the 24 landmarks seed automatically into an empty database.

## Tests

```bash
npx playwright install chromium   # once
npm run e2e
```

The suite builds the client, boots the server on a throwaway database, and drives the real app at 390×844 with mocked geolocation: registration → locked passport → in-range detection at the Eiffel Tower → collect → persistence across reload → custom place creation → **server-side rejection of far-away coordinates** → auth and privacy checks.

## Stamp art

Every stamp is a deterministic SVG generated from the place's identity: an FNV-1a hash picks the palette, sun position, hills, denomination, and album tilt. Curated landmarks use hand-authored silhouette paths (`client/src/art/landmarks.ts`); custom places pick from eight scene motifs. Open `/gallery` for the full sheet — it's the visual QA harness.

App icons are rendered from the same design language: `npm run gen-icons` (requires Playwright's chromium).
