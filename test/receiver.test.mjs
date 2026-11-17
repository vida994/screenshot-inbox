import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile, mkdir, symlink, utimes, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { makeReceiver } from '../src/server.mjs';
import { latestImage } from '../skills/screenshot-inbox/scripts/inbox.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'screenshot-inbox-test-'));
  const inbox = join(directory, 'images');
  const server = makeReceiver({ inbox, token: 'test-only-token', ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }); await rm(directory, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}/upload`;
  const upload = (body = png, headers = {}) => fetch(url, { method: 'POST', headers: { Authorization: 'Bearer test-only-token', ...headers }, body });
  return { inbox, directory, url, upload };
}

test('upload arrives byte-for-byte and the independent skill helper finds it', async (t) => {
  const { inbox, upload } = await fixture(t);
  const response = await upload();
  assert.equal(response.status, 201);
  const latest = await latestImage(inbox);
  assert.deepEqual(await readFile(latest.path), png);
  assert.equal(latest.size, png.length);
  assert.ok(latest.ageSeconds < 10);
  assert.equal((await readdir(inbox)).length, 1);
  assert.ok(!(await response.text()).includes('test-only-token'));
});

test('missing/wrong tokens and browser-origin requests cannot write images', async (t) => {
  const { inbox, upload } = await fixture(t);
  for (const headers of [{ Authorization: '' }, { Authorization: 'Bearer wrong' }, { Origin: 'https://example.com' }]) {
    const response = await upload(png, headers);
    assert.equal(response.status, 401);
    await response.text();
  }
  await assert.rejects(readdir(inbox), { code: 'ENOENT' });
});

test('rejects nonimages and oversized requests without creating a screenshot', async (t) => {
  const { inbox, upload } = await fixture(t, { maxBytes: 100 });
  for (const [body, status] of [[Buffer.from('not an image'), 415], [Buffer.alloc(101), 413]]) {
    const response = await upload(body);
    assert.equal(response.status, status);
    await response.text();
  }
  await assert.rejects(readdir(inbox), { code: 'ENOENT' });
});

test('rejects chunked uploads over the limit', async (t) => {
  const { inbox, url } = await fixture(t, { maxBytes: 100 });
  async function* bytes() { yield Buffer.alloc(60); yield Buffer.alloc(60); }
  const response = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer test-only-token' }, body: bytes(), duplex: 'half' });
  assert.equal(response.status, 413);
  await response.text();
  await assert.rejects(readdir(inbox), { code: 'ENOENT' });
});

test('concurrent uploads get distinct filenames and publish complete files', async (t) => {
  const { inbox, upload } = await fixture(t);
  const responses = await Promise.all(Array.from({ length: 4 }, () => upload()));
  for (const response of responses) { assert.equal(response.status, 201); await response.text(); }
  const files = await readdir(inbox);
  assert.equal(files.length, 4);
  for (const name of files) assert.deepEqual(await readFile(join(inbox, name)), png);
});

test('latest ignores unfinished files and symlinks and selects most recent receipt', async (t) => {
  const { inbox, directory, upload } = await fixture(t);
  await upload().then((response) => response.text());
  const first = await latestImage(inbox);
  await utimes(first.path, new Date(0), new Date(0));
  await upload().then((response) => response.text());
  const second = await latestImage(inbox);
  assert.notEqual(first.path, second.path);
  await writeFile(join(inbox, '.pending.upload'), png);
  await writeFile(join(directory, 'outside.png'), png);
  await symlink(join(directory, 'outside.png'), join(inbox, 'screenshot-2099-01-01T00-00-00-000Z-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png'));
  assert.equal((await latestImage(inbox)).path, second.path);
});

test('an empty inbox reports that no screenshots have arrived', async (t) => {
  const { inbox } = await fixture(t);
  await mkdir(inbox);
  await assert.rejects(latestImage(inbox), /No screenshots received yet/);
});

test('receiver does not expose saved files over HTTP', async (t) => {
  const { url, upload } = await fixture(t);
  await upload().then((response) => response.text());
  const response = await fetch(url.replace('/upload', '/'), { headers: { Authorization: 'Bearer test-only-token' } });
  assert.equal(response.status, 404);
});
