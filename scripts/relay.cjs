'use strict';
// A standalone SEA executable: only Node built-ins, no external runtime required.
const receivedAt = Date.now();
const { randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const http = require('node:http');
let stop = false;
let provider = 'codex';
let origin;
let finished = false;
function finish() {
  if (finished) return;
  finished = true;
  if (stop) process.stdout.write('{}\n', () => process.exit(0));
  else process.exit(0);
}
setTimeout(finish, 800);
process.on('uncaughtException', finish);
process.on('unhandledRejection', finish);
process.stdout.on('error', () => process.exit(0));
let size = 0;
const chunks = [];
process.stdin.on('error', finish);
process.stdin.on('data', chunk => {
  size += chunk.length;
  if (size > 1024 * 1024) return finish();
  chunks.push(chunk);
});
process.stdin.on('end', async () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    stop = input?.hook_event_name === 'Stop';
    if (!input || typeof input !== 'object' || Array.isArray(input)) return finish();
    const providerIndex = process.argv.indexOf('--provider');
    if (providerIndex >= 0) provider = process.argv[providerIndex + 1];
    if (!['codex','claude'].includes(provider)) return finish();
    const originIndex = process.argv.indexOf('--origin');
    if (originIndex >= 0) {
      origin = process.argv[originIndex + 1];
      if (typeof origin !== 'string' || !/^wsl:[A-Za-z0-9._-]{1,80}$/.test(origin)) return finish();
    }
    const hook = {};
    for (const key of ['hook_event_name', 'session_id', 'turn_id', 'tool_name', 'tool_use_id', 'last_assistant_message']) {
      if (typeof input[key] === 'string') hook[key] = input[key].slice(0, key === 'last_assistant_message' ? 180 : 512);
    }
    const index = process.argv.indexOf('--connection');
    if (index < 0 || !process.argv[index + 1]) return finish();
    const raw = await readFile(process.argv[index + 1], 'utf8');
    if (raw.length > 8192) return finish();
    const connection = JSON.parse(raw);
    if (!Number.isInteger(connection.port) || connection.port < 1 || connection.port > 65535 || typeof connection.token !== 'string' || !/^[a-f0-9]{64}$/i.test(connection.token)) return finish();
    const body = JSON.stringify({ id: randomUUID(), provider, ...(origin ? {origin} : {}), receivedAt, hook });
    const req = http.request({ hostname: '127.0.0.1', port: connection.port, path: '/events', method: 'POST', agent: false,
      headers: { Authorization: `Bearer ${connection.token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, response => { response.resume(); response.on('end', finish); response.on('error', finish); });
    req.on('error', finish);
    req.setTimeout(500, () => { req.destroy(); finish(); });
    req.end(body);
  } catch { finish(); }
});
