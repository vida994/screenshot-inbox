import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('../bin/screenshot-inbox.mjs', import.meta.url));
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'screenshot-inbox-settings-'));
  const path = join(root, 'config.json');
  const inbox = join(root, 'original');
  await mkdir(inbox);
  const config = { inbox, token: 'private-test-pairing-token', host: 'test.local', port: 4827 };
  await writeFile(path, JSON.stringify(config));
  t.after(() => rm(root, { recursive: true, force: true }));
  const run = (...args) => spawnSync(process.execPath, [cli, 'settings', ...args], { encoding: 'utf8', env: { ...process.env, SCREENSHOT_INBOX_CONFIG: path } });
  return { root, path, inbox, config, run };
}

test('settings can change all storage preferences without changing pairing or moving old files', async (t) => {
  const { root, path, inbox, config, run } = await fixture(t);
  await writeFile(join(inbox, 'existing.txt'), 'preserve');
  const destination = join(root, 'selected-folder');
  const result = run('--inbox', destination, '--max-count', '30', '--max-days', '14', '--date-folders', 'false');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes(config.token));
  const saved = JSON.parse(await readFile(path, 'utf8'));
  assert.deepEqual(saved, { ...config, inbox: destination, maxCount: 30, maxDays: 14, dateFolders: false });
  assert.equal(await readFile(join(inbox, 'existing.txt'), 'utf8'), 'preserve');
  assert.ok(result.stdout.includes('Existing screenshots remain'));
  assert.equal((await stat(path)).mode & 0o777, 0o600);
});

test('invalid settings and unknown options fail before changing the config', async (t) => {
  const { path, run } = await fixture(t);
  const before = await readFile(path, 'utf8');
  for (const args of [['--max-count', '0'], ['--max-days', '-3'], ['--date-folders', 'maybe'], ['--host', 'other.local'], ['--typo', '3']]) {
    const result = run(...args);
    assert.equal(result.status, 1);
    assert.equal(await readFile(path, 'utf8'), before);
  }
});

test('noninteractive settings display excludes credentials and preserves existing config', async (t) => {
  const { config, path, run } = await fixture(t);
  const before = await readFile(path, 'utf8');
  const result = run();
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('Keep latest: 20'));
  assert.ok(!result.stdout.includes(config.token));
  assert.equal(await readFile(path, 'utf8'), before);
});
