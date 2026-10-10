import { readFile, writeFile, mkdir, cp, stat } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, args) => i % 2 ? pairs : [...pairs, [arg, args[i+1]]], []));
const backup = resolve(options['--backup'] ?? '');
const output = resolve(options['--out'] ?? '');
const origin = options['--origin'] ?? '';
if (!options['--backup'] || !options['--out'] || !process.env.MIGRATION_ADMIN_PASSWORD) throw new Error('Set MIGRATION_ADMIN_PASSWORD, then pass --backup path --out new-path [--origin https://site] [--php path-to-php]');
if (origin && !/^https:\/\/[^/]+$/.test(origin) && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Origin must be HTTPS or local test URL, without a trailing slash');
const manifest = JSON.parse(await readFile(join(backup, 'manifest.json'), 'utf8'));
for (const file of manifest.files) {
  if (!/^(payments\.json|photos[\\/][a-zA-Z0-9-]{1,80}\.(png|jpg|webp))$/.test(file.path)) throw new Error('Unexpected path in backup');
  const bytes = await readFile(join(backup, file.path));
  if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256.toLowerCase()) throw new Error('Backup integrity error');
}
const payments = JSON.parse(await readFile(join(backup, 'payments.json'), 'utf8'));
if (!Array.isArray(payments) || payments.length > 20 || payments.length !== manifest.count || new Set(payments.map(p=>p.slot)).size !== payments.length) throw new Error('Invalid payment snapshot');
for (const p of payments) {
  if (!Number.isInteger(p.slot) || p.slot<1 || p.slot>20 || !Number.isSafeInteger(p.amountKopecks) || p.amountKopecks<=0 || !Number.isInteger(p.version) || p.version<1 || !/^[a-zA-Z0-9-]{1,80}\.(png|jpg|webp)$/.test(p.photoKey)) throw new Error('Invalid payment');
  await stat(join(backup, 'photos', p.photoKey));
}
const total = payments.reduce((sum,p)=>sum+p.amountKopecks,0);
if (total !== manifest.totalKopecks || new Set(payments.map(p=>p.photoKey)).size !== manifest.photoCount) throw new Error('Snapshot totals disagree');
await stat(join(root, 'outputs/shared-host/frontend/index.html'));
const hash = execFileSync(options['--php'] ?? 'php', ['-r', "echo password_hash(getenv('MIGRATION_ADMIN_PASSWORD'), PASSWORD_BCRYPT);"], { encoding:'utf8', env:process.env }).trim();
if (!hash.startsWith('$2y$')) throw new Error('Cannot create password hash');
await mkdir(dirname(output), { recursive:true });
await mkdir(output, { recursive:false }); // Never overwrite a deployed state or a prior archive.
await cp(join(root, 'outputs/shared-host/frontend'), join(output, 'public_html'), { recursive:true });
await cp(join(root, 'hosting/public_html'), join(output, 'public_html'), { recursive:true });
const data = join(output, 'zaruba-data');
await mkdir(data, { mode:0o700 });
await mkdir(join(data,'photos'), { mode:0o700 });
for (const key of new Set(payments.map(p=>p.photoKey))) await cp(join(backup,'photos',key),join(data,'photos',key));
const config = { passwordHash:hash, sessionSecret:randomBytes(48).toString('hex'), origin };
const encoded = Buffer.from(JSON.stringify(config)).toString('base64');
await writeFile(join(data, 'config.php'), `<?php\nreturn json_decode(base64_decode('${encoded}'), true, 512, JSON_THROW_ON_ERROR);\n`, { mode:0o600 });
await writeFile(join(data, '.htaccess'), 'Require all denied\n');
await writeFile(join(data, 'payments.json'), JSON.stringify({ payments, slotVersions:Object.fromEntries(payments.map(p=>[p.slot,p.version])) }, null, 2), { mode:0o600 });
await writeFile(join(output, 'migration-manifest.json'), JSON.stringify({ ...manifest, files:manifest.files, targetOrigin:origin||null, deploymentStatus:'prepared-not-deployed', packagedAt:new Date().toISOString() }, null, 2));
await cp(join(root, 'hosting/README.md'), join(output, 'ПРОЧИТАЙТЕ.md'));
console.log(JSON.stringify({ output, payments:payments.length, totalRubles:total/100, photos:manifest.photoCount, origin:origin||'needs configuration' }));
