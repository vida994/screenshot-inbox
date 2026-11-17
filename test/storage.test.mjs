import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, utimes, realpath } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { cleanupImages, uploadDirectory, localDay } from '../src/storage.mjs';
import { listImages, latestImage, storageSettings } from '../skills/screenshot-inbox/scripts/inbox.mjs';

const now = Date.UTC(2026, 10, 17, 12);
const day = 86400000;
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'screenshot-inbox-retention-')));
  const inbox = join(root, 'inbox');
  await mkdir(inbox);
  t.after(() => rm(root, { recursive: true, force: true }));
  async function image(time, folder = '') {
    const directory = join(inbox, folder);
    await mkdir(directory, { recursive: true });
    const name = `screenshot-${new Date(time).toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.png`;
    const file = join(directory, name);
    await writeFile(file, 'test image');
    return file;
  }
  return { root, inbox, image };
}

test('count limit applies globally across legacy root and multiple date folders', async (t) => {
  const { inbox, image } = await fixture(t);
  for (let index = 0; index < 25; index++) await image(now - index * 3600000, index % 2 ? '2026-11-17' : '');
  const result = await cleanupImages({ inbox, maxCount: 20, maxDays: 7 }, now);
  assert.deepEqual(result, { deleted: 5, remaining: 20 });
  assert.equal((await listImages(inbox)).at(-1).receivedMs, now - 19 * 3600000);
});

test('age limit removes old images even below the count limit, including exact boundary', async (t) => {
  const { inbox, image } = await fixture(t);
  await image(now - 8 * day, '2026-11-09');
  await image(now - 7 * day - 1);
  const boundary = await image(now - 7 * day);
  await image(now);
  assert.deepEqual(await cleanupImages({ inbox, maxCount: 20, maxDays: 7 }, now), { deleted: 2, remaining: 2 });
  assert.equal(await readFile(boundary, 'utf8'), 'test image');
  assert.ok(!(await readdir(inbox)).includes('2026-11-09'));
});

test('receipt time survives touching or moving an image', async (t) => {
  const { inbox, image } = await fixture(t);
  const old = await image(now - 8 * day);
  await utimes(old, new Date(now), new Date(now));
  const latest = await image(now);
  await utimes(latest, new Date(0), new Date(0));
  assert.equal((await latestImage(inbox)).path, latest);
  await cleanupImages({ inbox }, now);
  assert.equal((await listImages(inbox)).length, 1);
});

test('cleanup preserves unrelated files, invalid names, arbitrary folders and symlink targets', async (t) => {
  const { root, inbox, image } = await fixture(t);
  const old = await image(now - 8 * day, '2026-11-09');
  const keep = join(inbox, '2026-11-09', 'notes.txt');
  await writeFile(keep, 'keep');
  const unrelated = join(inbox, 'photo.png');
  await writeFile(unrelated, 'keep');
  const nested = await image(now - 9 * day, 'unrelated-folder');
  const invalid = join(inbox, 'screenshot-2026-99-99T00-00-00-000Z-11111111-1111-4111-8111-111111111111.png');
  await writeFile(invalid, 'keep');
  const outside = join(root, 'outside');
  await mkdir(outside);
  const outsideFile = join(outside, old.split('/').at(-1));
  await writeFile(outsideFile, 'keep');
  await symlink(outside, join(inbox, '2026-11-08'));
  const linkedFile = join(inbox, 'screenshot-2026-11-08T00-00-00-000Z-11111111-1111-4111-8111-111111111111.png');
  await symlink(outsideFile, linkedFile);
  assert.equal((await cleanupImages({ inbox }, now)).deleted, 1);
  for (const file of [keep, unrelated, nested, invalid, outsideFile, linkedFile]) assert.equal(await readFile(file, 'utf8'), file === nested ? 'test image' : 'keep');
});

test('uploads use local-date folders and reject a symlink at the target day', async (t) => {
  const { root, inbox } = await fixture(t);
  const date = new Date(now);
  assert.equal(await uploadDirectory(inbox, true, date), join(inbox, localDay(date)));
  const other = new Date(now + day);
  await symlink(root, join(inbox, localDay(other)));
  await assert.rejects(uploadDirectory(inbox, true, other), /real directory/);
  assert.equal(await uploadDirectory(inbox, false, date), inbox);
});

test('invalid retention values cannot delete anything', async (t) => {
  const { inbox, image } = await fixture(t);
  const file = await image(now - 99 * day);
  for (const config of [{ maxCount: 0 }, { maxDays: -1 }, { maxCount: 1.5 }, { maxDays: '7' }, { dateFolders: 'false' }]) {
    await assert.rejects(cleanupImages({ inbox, ...config }, now));
    assert.equal(await readFile(file, 'utf8'), 'test image');
  }
});

test('new defaults use Documents and existing configured folders remain valid', () => {
  assert.deepEqual(storageSettings(), { inbox: join(homedir(), 'Documents', 'Screenshot Inbox'), maxCount: 20, maxDays: 7, dateFolders: true });
  assert.equal(storageSettings({ inbox: '/custom/inbox' }).inbox, '/custom/inbox');
});

test('cleanup of a nonexistent inbox does not create folders', async (t) => {
  const { root } = await fixture(t);
  const missing = join(root, 'missing');
  assert.deepEqual(await cleanupImages({ inbox: missing }, now), { deleted: 0, remaining: 0 });
  await assert.rejects(readdir(missing), { code: 'ENOENT' });
});
