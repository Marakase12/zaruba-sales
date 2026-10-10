import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const source = process.argv[2];
const output = process.argv[3];
if (!source || !output || new URL(source).protocol !== 'https:') throw new Error('Usage: node --use-env-proxy scripts/export-shared-host.mjs https://source-site output-directory');
const origin = new URL(source).origin;
const destination = resolve(output);
await mkdir(destination, { recursive: false });
await mkdir(join(destination, 'photos'));
const get = async (path) => {
  const response = await fetch(origin + path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Export HTTP ${response.status}: ${path}`);
  return response;
};
const first = await (await get('/api/payments')).json();
if (!Array.isArray(first.payments)) throw new Error('Invalid source response');
const files = [];
async function save(path, bytes) {
  await writeFile(join(destination, path), bytes);
  files.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
for (const key of new Set(first.payments.map(p => p.photoKey))) {
  if (!/^[a-zA-Z0-9-]{1,80}\.(png|jpg|webp)$/.test(key)) throw new Error('Invalid photo key');
  const response = await get('/api/photos/' + encodeURIComponent(key));
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 5_000_000) throw new Error('Invalid photo size');
  await save('photos/' + key, bytes);
}
const second = await (await get('/api/payments')).json();
if (JSON.stringify(first.payments) !== JSON.stringify(second.payments)) throw new Error('Source changed during export. Leave this snapshot unused and export to a new directory.');
await save('payments.json', Buffer.from(JSON.stringify(first.payments, null, 2)));
const manifest = { source: origin, capturedAt: new Date().toISOString(), count: first.payments.length,
  totalKopecks: first.payments.reduce((sum, p) => sum + p.amountKopecks, 0),
  photoCount: new Set(first.payments.map(p => p.photoKey)).size, files };
await writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ output: destination, count: manifest.count, totalKopecks: manifest.totalKopecks, photos: manifest.photoCount }));
