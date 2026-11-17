import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFile, readdir, lstat, realpath } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function configPath() {
  return process.env.SCREENSHOT_INBOX_CONFIG || join(homedir(), '.config', 'screenshot-inbox', 'config.json');
}

export async function loadConfig() {
  let config;
  try { config = JSON.parse(await readFile(configPath(), 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error('Screenshot Inbox is not configured. Run npm run setup in its checkout.');
    throw error;
  }
  if (!config.inbox || !config.token || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('Invalid Screenshot Inbox configuration. Run setup again.');
  }
  return config;
}

export async function latestImage(inbox) {
  const root = await realpath(inbox);
  const candidates = [];
  for (const name of await readdir(root)) {
    if (!/^screenshot-\d{4}-\d{2}-\d{2}T[\d-]+Z-[a-f0-9-]+\.(png|jpg)$/.test(name)) continue;
    const file = join(root, name);
    let stat;
    try { stat = await lstat(file); } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    // Never follow image symlinks outside the inbox.
    if (stat.isFile()) candidates.push({ path: file, receivedAt: stat.mtime.toISOString(), size: stat.size, mtime: stat.mtimeMs });
  }
  candidates.sort((a, b) => b.mtime - a.mtime || b.path.localeCompare(a.path));
  if (!candidates.length) throw new Error('No screenshots received yet. Share one image from your iPhone using Send to Codex.');
  const { mtime, ...latest } = candidates[0];
  return { ...latest, ageSeconds: Math.max(0, Math.floor((Date.now() - mtime) / 1000)) };
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
