import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

export async function startReceiver(token: string, onEvent: (payload: unknown) => void): Promise<{ port: number; close: () => Promise<void> }> {
  if (!token) throw new Error('A receiver token is required');
  const expected = Buffer.from(`Bearer ${token}`);
  const server = createServer((req, res) => {
    const finish = (code: number) => { res.writeHead(code, { Connection: 'close' }); res.end(); };
    if (req.headers.origin !== undefined || req.headers['sec-fetch-site'] !== undefined) return finish(403);
    if (req.method !== 'POST' || req.url !== '/events') return finish(404);
    const actual = Buffer.from(req.headers.authorization ?? '');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return finish(401);
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) return finish(415);
    if (Number(req.headers['content-length'] ?? 0) > 65536) return finish(413);
    let size = 0;
    const chunks: Buffer[] = [];
    let rejected = false;
    req.setTimeout(1000, () => { rejected = true; finish(408); req.destroy(); });
    req.on('data', (chunk: Buffer) => {
      if (rejected) return;
      size += chunk.length;
      if (size > 65536) { rejected = true; finish(413); return; }
      chunks.push(chunk);
    });
    req.on('error', () => {});
    req.on('end', () => {
      if (rejected) return;
      try { onEvent(JSON.parse(Buffer.concat(chunks).toString('utf8'))); finish(204); }
      catch { finish(400); }
    });
  });
  server.headersTimeout = 1500;
  server.requestTimeout = 1500;
  server.maxConnections = 32;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Receiver failed to bind');
  return { port: address.port, close: () => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }) };
}
