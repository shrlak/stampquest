import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
const configuredIterations = source.match(/const PASSWORD_ITERATIONS = ([\d_]+);/);

assert.ok(configuredIterations, 'PASSWORD_ITERATIONS must remain a numeric constant');
const iterations = Number(configuredIterations[1].replaceAll('_', ''));
assert.ok(
  iterations <= 100_000,
  `Cloudflare workerd supports at most 100,000 PBKDF2 iterations; found ${iterations}`,
);

console.log(JSON.stringify({ ok: true, passwordIterations: iterations }));
