// Exercise the configured executable against an isolated receiver, without creating a pet task.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.claude/settings.json'), 'utf8'));
const hook = config.hooks.Stop.flatMap(group => group.hooks).find(h => h.command?.endsWith(' --desktop-pet-claude-hook-v1'));
const dir = fs.mkdtempSync(path.join(process.cwd(), 'test-results/claude-relay-'));
const connection = path.join(dir, 'connection.json');
const token = 'a'.repeat(64);
let received = false;
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const event = JSON.parse(body);
    received = req.headers.authorization === `Bearer ${token}` && event.provider === 'claude' && event.hook.session_id === 'relay-verification';
    res.writeHead(204).end();
  });
});
server.listen(0, '127.0.0.1', () => {
  fs.writeFileSync(connection, JSON.stringify({port: server.address().port, token}));
  const command = hook.command.replace(/--connection "[^"]+"/, `--connection "${connection}"`);
  const child = spawn('pwsh.exe', ['-NoProfile', '-Command', command], {windowsHide: true});
  let stderr = '';
  child.stderr.on('data', chunk => stderr += chunk);
  child.stdout.resume();
  child.stdin.end(JSON.stringify({hook_event_name:'Stop', session_id:'relay-verification'}));
  child.on('close', code => {
    server.close();
    fs.unlinkSync(connection);
    console.log(JSON.stringify({code, received, stderr}));
    process.exitCode = code === 0 && received && !stderr ? 0 : 1;
  });
});
