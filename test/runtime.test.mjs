import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const desktop = fileURLToPath(new URL('../desktop.mjs', import.meta.url));
async function fixture(t, occupied = false) {
  const root = await mkdtemp(join(tmpdir(), 'screenshot-inbox-desktop-'));
  const listener = createServer();
  listener.listen(0, '0.0.0.0');
  await once(listener, 'listening');
  const port = listener.address().port;
  if (!occupied) await new Promise((resolve) => listener.close(resolve));
  const path = join(root, 'config.json');
  await writeFile(path, JSON.stringify({ inbox: join(root, 'images'), token: 'test-only-token', port }));
  const child = spawn(process.execPath, [desktop], { env: { ...process.env, SCREENSHOT_INBOX_CONFIG: path }, stdio: ['pipe', 'pipe', 'pipe'] });
  const closed = once(child, 'close');
  const lines = createInterface({ input: child.stdout });
  const events = [];
  const event = new Promise((resolve) => lines.on('line', (line) => { const value = JSON.parse(line); events.push(value); if (['ready', 'error'].includes(value.event)) resolve(value); }));
  t.after(async () => {
    if (child.exitCode === null) child.kill('SIGTERM');
    await closed;
    listener.close();
    await rm(root, { recursive: true, force: true });
  });
  return { child, closed, event, events, port };
}

test('desktop receiver exits when its parent closes stdin', { timeout: 10000 }, async (t) => {
  const { child, event, closed, port, events } = await fixture(t);
  assert.deepEqual(await event, { event: 'ready', port });
  child.stdin.end();
  assert.equal((await closed)[0], 0);
  assert.ok(events.some((value) => value.event === 'stopped'));
  assert.ok(!JSON.stringify(events).includes('test-only-token'));
});

test('desktop stop command closes the receiver normally', { timeout: 10000 }, async (t) => {
  const { child, event, closed } = await fixture(t);
  assert.equal((await event).event, 'ready');
  child.stdin.write('stop\n');
  assert.equal((await closed)[0], 0);
});

test('desktop port conflict reports a typed failure and exits without adopting it', { timeout: 10000 }, async (t) => {
  const { event, closed } = await fixture(t, true);
  assert.deepEqual(await event, { event: 'error', code: 'EADDRINUSE' });
  assert.equal((await closed)[0], 98);
});
