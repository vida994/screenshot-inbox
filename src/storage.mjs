import { mkdir, lstat, realpath, unlink, rmdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { listImages, storageSettings } from '../skills/screenshot-inbox/scripts/inbox.mjs';

export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export async function uploadDirectory(inbox, dateFolders, date = new Date()) {
  await mkdir(inbox, { recursive: true, mode: 0o700 });
  const root = await realpath(inbox);
  if (!dateFolders) return root;
  const directory = join(root, localDay(date));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Date folder must be a real directory.');
  return directory;
}

export async function cleanupImages(config, now = Date.now()) {
  const { inbox, maxCount, maxDays } = storageSettings(config);
  const images = await listImages(inbox);
  const cutoff = now - maxDays * 24 * 60 * 60 * 1000;
  const expired = images.filter((image, index) => index >= maxCount || image.receivedMs < cutoff);
  if (!expired.length) return { deleted: 0, remaining: images.length };
  const root = await realpath(inbox);
  let deleted = 0;
  for (const image of expired) {
    const directory = dirname(image.path);
    try {
      // Recheck both the parent and the file before deleting anything.
      const parent = await lstat(directory);
      if (!parent.isDirectory() || parent.isSymbolicLink() || await realpath(directory) !== directory) continue;
      if (directory !== root && dirname(directory) !== root) continue;
      const current = await lstat(image.path);
      if (!current.isFile() || current.ino !== image.ino || current.dev !== image.dev) continue;
      await unlink(image.path);
      deleted++;
      // Only prune a date folder that this pass emptied. Never recurse.
      if (directory !== root) await rmdir(directory).catch((error) => { if (!['ENOTEMPTY', 'ENOENT', 'EEXIST'].includes(error.code)) throw error; });
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { deleted, remaining: images.length - deleted };
}
