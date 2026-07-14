// Renders the app icon with the preinstalled Playwright chromium — no
// image-processing dependencies. Run from the repo root:
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/gen-icons.mjs
// (or just `npm run gen-icons` after `npx playwright install chromium`).
// Outputs are committed, so this only needs re-running when the mark changes.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'client', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// Original picture-stamp mark shared with BrandMark.tsx.
const iconSvg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#f6f0e2"/>
  <g transform="translate(256 256) rotate(-4) translate(-256 -256)">
    <g transform="translate(${pad} ${pad}) scale(${(512 - 2 * pad) / 360})">
      <defs>
        <mask id="perf">
          <rect x="0" y="0" width="360" height="360" fill="white"/>
          ${[0, 1, 2, 3, 4, 5, 6, 7, 8]
            .map((i) => {
              const p = (360 / 8) * i;
              return `<circle cx="${p}" cy="0" r="14" fill="black"/>
                <circle cx="${p}" cy="360" r="14" fill="black"/>
                <circle cx="0" cy="${p}" r="14" fill="black"/>
                <circle cx="360" cy="${p}" r="14" fill="black"/>`;
            })
            .join('')}
        </mask>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f4d3a0"/>
          <stop offset="100%" stop-color="#efae7e"/>
        </linearGradient>
      </defs>
      <g mask="url(#perf)">
        <rect width="360" height="360" fill="#faf5e9"/>
        <rect x="36" y="36" width="288" height="288" fill="url(#sky)"/>
        <circle cx="234" cy="118" r="42" fill="#d96f4e"/>
        <circle cx="234" cy="118" r="60" fill="none" stroke="#d96f4e" stroke-width="5" opacity="0.35"/>
        <path d="M36 324 L36 250 L110 148 L162 216 L220 130 L324 260 L324 324 Z" fill="#4a382c"/>
        <path d="M220 130 L245 162 L233 152 L220 168 L207 152 L196 161 Z" fill="#faf5e9" opacity="0.92"/>
        <rect x="36" y="36" width="288" height="288" fill="none" stroke="#4a382c" stroke-width="7"/>
      </g>
    </g>
  </g>
</svg>`;

const html = (svg, size) =>
  `<!doctype html><style>html,body{margin:0}</style><div style="width:${size}px;height:${size}px">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 600 } });

const targets = [
  // maskable needs generous padding (safe zone = inner 80%)
  { file: 'pwa-512.png', size: 512, pad: 64 },
  { file: 'pwa-192.png', size: 192, pad: 64 },
  { file: 'apple-touch-icon.png', size: 180, pad: 48 },
];

for (const t of targets) {
  await page.setContent(html(iconSvg(t.pad), t.size));
  const el = page.locator('div');
  await el.screenshot({ path: join(outDir, t.file) });
  console.log('wrote', t.file);
}

await browser.close();
