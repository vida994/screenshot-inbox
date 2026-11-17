import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile, mkdir, symlink, utimes, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { makeReceiver } from '../src/server.mjs';
import { latestImage, listImages } from '../skills/screenshot-inbox/scripts/inbox.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'screenshot-inbox-test-'));
  const inbox = join(directory, 'images');
  if (options.beforeListen) await options.beforeListen(inbox);
  const server = makeReceiver({ inbox, token: 'test-only-token', ...options, getSettings: options.getSettings ? () => options.getSettings(inbox) : undefined });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }); await rm(directory, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}/upload`;
  const upload = (body = png, headers = {}) => fetch(url, { method: 'POST', headers: { Authorization: 'Bearer test-only-token', ...headers }, body });
  return { inbox, directory, url, upload, server };
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
  const files = await listImages(inbox);
  assert.equal(files.length, 4);
  for (const file of files) assert.deepEqual(await readFile(file.path), png);
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

test('receiver applies changed storage settings on the next upload', async (t) => {
  let selected;
  const { inbox, directory, upload } = await fixture(t, { getSettings: (inbox) => selected || { inbox } });
  for (let index = 0; index < 4; index++) await upload().then((response) => response.text());
  selected = { inbox, maxCount: 2, maxDays: 7, dateFolders: false };
  await upload().then((response) => response.text());
  assert.equal((await listImages(inbox)).length, 2);
  selected = { ...selected, inbox: join(directory, 'other-inbox') };
  const response = await upload();
  assert.equal(response.status, 201);
  await response.text();
  assert.equal((await listImages(selected.inbox)).length, 1);
});

test('scheduled cleanup expires an image without another upload', { timeout: 2000 }, async (t) => {
  let cleaned;
  const completion = new Promise((resolve) => { cleaned = resolve; });
  const { inbox, server } = await fixture(t, { cleanupIntervalMs: 20, onCleanup: cleaned });
  await server.cleanupNow();
  await mkdir(inbox, { recursive: true });
  const old = new Date(Date.now() - 8 * 86400000).toISOString().replace(/[:.]/g, '-');
  await writeFile(join(inbox, `screenshot-${old}-11111111-1111-4111-8111-111111111111.png`), png);
  assert.equal(await completion, 1);
  assert.equal((await listImages(inbox)).length, 0);
});

test('startup cleanup expires existing images before any upload', { timeout: 2000 }, async (t) => {
  let cleaned;
  const completion = new Promise((resolve) => { cleaned = resolve; });
  const { inbox } = await fixture(t, {
    onCleanup: cleaned,
    beforeListen: async (folder) => {
      await mkdir(folder);
      const old = new Date(Date.now() - 8 * 86400000).toISOString().replace(/[:.]/g, '-');
      await writeFile(join(folder, `screenshot-${old}-11111111-1111-4111-8111-111111111111.png`), png);
    },
  });
  assert.equal(await completion, 1);
  assert.equal((await listImages(inbox)).length, 0);
});

test('concurrent uploads enforce one count limit without leftover temporary files', async (t) => {
  const { inbox, upload } = await fixture(t, { maxCount: 2 });
  const responses = await Promise.all(Array.from({ length: 4 }, () => upload()));
  for (const response of responses) { assert.equal(response.status, 201); await response.text(); }
  assert.equal((await listImages(inbox)).length, 2);
  const folders = await readdir(inbox);
  for (const folder of folders) assert.ok((await readdir(join(inbox, folder))).every((name) => name.endsWith('.png')));
});
