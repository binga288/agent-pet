import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inject } from 'postject';

const out = resolve('dist/relay');
await mkdir(out, { recursive: true });
const blob = resolve(out, 'relay.blob');
const config = resolve(out, 'sea-config.json');
await writeFile(config, JSON.stringify({ main: resolve('scripts/relay.cjs'), output: blob, disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false }));
execFileSync(process.execPath, ['--experimental-sea-config', config], { stdio: 'inherit' });
const target = resolve(out, process.platform === 'win32' ? 'desktop-pet-relay.exe' : 'desktop-pet-relay');
await copyFile(process.execPath, target);
await inject(target, 'NODE_SEA_BLOB', await readFile(blob), { sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2', ...(process.platform === 'darwin' ? { machoSegmentName: 'NODE_SEA' } : {}) });
console.log(target);
