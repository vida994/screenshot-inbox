import { homedir } from 'node:os';
import { join, resolve, isAbsolute } from 'node:path';
import { readFile, readdir, lstat, realpath } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function configPath() {
  return process.env.SCREENSHOT_INBOX_CONFIG || join(homedir(), '.config', 'screenshot-inbox', 'config.json');
}

export function storageSettings(config = {}) {
  const settings = {
    inbox: config.inbox ?? join(homedir(), 'Documents', 'Screenshot Inbox'),
    maxCount: config.maxCount ?? 20,
    maxDays: config.maxDays ?? 7,
    dateFolders: config.dateFolders ?? true,
  };
  if (typeof settings.inbox !== 'string' || !isAbsolute(settings.inbox)) throw new Error('Inbox must be an absolute folder path.');
  for (const name of ['maxCount', 'maxDays']) {
    if (!Number.isSafeInteger(settings[name]) || settings[name] < 1 || settings[name] > 10000) throw new Error(`${name} must be a whole number from 1 to 10000.`);
  }
  if (typeof settings.dateFolders !== 'boolean') throw new Error('dateFolders must be true or false.');
  return settings;
}

export async function loadConfig() {
  let config;
  try { config = JSON.parse(await readFile(configPath(), 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error('Screenshot Inbox is not configured. Run npm run setup in its checkout.');
    throw error;
  }
  if (!config.inbox || typeof config.token !== 'string' || !config.token || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('Invalid Screenshot Inbox configuration. Run setup again.');
  }
  return { ...config, ...storageSettings(config) };
}

export function receivedTime(name) {
  const match = /^screenshot-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(png|jpg)$/.exec(name);
  if (!match) return null;
  const iso = `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`;
  const time = Date.parse(iso);
  return Number.isFinite(time) && new Date(time).toISOString() === iso ? time : null;
}

export async function listImages(inbox) {
  let root;
  try { root = await realpath(inbox); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const candidates = [];
  async function scan(directory, includeDateFolders) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const file = join(directory, entry.name);
      if (includeDateFolders && entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name)) {
        let parent;
        try { parent = await lstat(file); }
        catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        if (parent.isDirectory() && !parent.isSymbolicLink()) await scan(file, false);
        continue;
      }
      const receivedMs = receivedTime(entry.name);
      if (receivedMs === null || !entry.isFile()) continue;
      let stat;
      try { stat = await lstat(file); } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      // Never follow image symlinks outside the inbox.
      if (stat.isFile()) candidates.push({ path: file, receivedAt: new Date(receivedMs).toISOString(), size: stat.size, receivedMs, ino: stat.ino, dev: stat.dev });
    }
  }
  await scan(root, true);
  return candidates.sort((a, b) => b.receivedMs - a.receivedMs || b.path.localeCompare(a.path));
}

export async function latestImage(inbox) {
  const candidates = await listImages(inbox);
  if (!candidates.length) throw new Error('No screenshots received yet. Share one image from your iPhone using Send to Codex.');
  const { receivedMs, ino, dev, ...latest } = candidates[0];
  return { ...latest, ageSeconds: Math.max(0, Math.floor((Date.now() - receivedMs) / 1000)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const config = await loadConfig();
    console.log(JSON.stringify(await latestImage(config.inbox), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
