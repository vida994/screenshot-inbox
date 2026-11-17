#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, chmod, cp, lstat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { configPath, loadConfig, storageSettings } from '../skills/screenshot-inbox/scripts/inbox.mjs';
import { makeReceiver } from '../src/server.mjs';
import { shortcutDefinition, toPlist } from '../src/shortcut.mjs';
import { cleanupImages } from '../src/storage.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [command, ...args] = process.argv.slice(2);

function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} needs a value.`);
  return args[index + 1];
}

function validateOptions() {
  const valued = new Set(['--host', '--port', '--inbox', '--max-count', '--max-days', '--date-folders']);
  const allowed = {
    setup: new Set([...valued, '--yes']),
    settings: new Set(['--inbox', '--max-count', '--max-days', '--date-folders', '--yes']),
    'install-skill': new Set(['--update']),
    start: new Set(),
    cleanup: new Set(),
  }[command] || new Set();
  for (let index = 0; index < args.length; index++) {
    if (!allowed.has(args[index])) throw new Error(`Unknown option for ${command}: ${args[index]}`);
    if (['--yes', '--update'].includes(args[index])) continue;
    if (!valued.has(args[index])) throw new Error(`Unknown option: ${args[index]}`);
    if (!args[++index] || args[index].startsWith('--')) throw new Error('Missing option value.');
  }
}

function expandPath(path) {
  if (path === '~') return homedir();
  return resolve(path.startsWith('~/') ? join(homedir(), path.slice(2)) : path);
}

async function chooseStorage(previous = {}) {
  const values = storageSettings(previous);
  if (process.stdin.isTTY && process.stdout.isTTY && args.length === 0) {
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try {
      console.log('Screenshots are automatically deleted when either retention limit is exceeded.');
      values.inbox = expandPath((await terminal.question(`Screenshot folder [${values.inbox}]: `)).trim() || values.inbox);
      values.maxCount = Number((await terminal.question(`Keep latest screenshots [${values.maxCount}]: `)).trim() || values.maxCount);
      values.maxDays = Number((await terminal.question(`Maximum age in days [${values.maxDays}]: `)).trim() || values.maxDays);
      const grouping = (await terminal.question(`Group into date folders? [${values.dateFolders ? 'Y/n' : 'y/N'}]: `)).trim().toLowerCase();
      if (grouping && !['y', 'yes', 'n', 'no'].includes(grouping)) throw new Error('Answer yes or no for date folders.');
      if (grouping) values.dateFolders = ['y', 'yes'].includes(grouping);
    } finally { terminal.close(); }
  }
  const grouping = option('--date-folders', String(values.dateFolders));
  if (!['true', 'false'].includes(grouping)) throw new Error('--date-folders needs true or false.');
  return storageSettings({
    inbox: expandPath(option('--inbox', values.inbox)),
    maxCount: Number(option('--max-count', values.maxCount)),
    maxDays: Number(option('--max-days', values.maxDays)),
    dateFolders: grouping === 'true',
  });
}

async function saveConfig(config) {
  const state = dirname(configPath());
  await mkdir(state, { recursive: true, mode: 0o700 });
  // Do not chmod an arbitrary existing parent of a custom config path.
  const temporary = `${configPath()}.${randomBytes(8).toString('hex')}.tmp`;
  const { rename, unlink } = await import('node:fs/promises');
  try {
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await rename(temporary, configPath());
  } finally { await unlink(temporary).catch(() => {}); }
}

function printSettings(config) {
  const values = storageSettings(config);
  console.log(`Inbox: ${values.inbox}\nKeep latest: ${values.maxCount}\nMaximum age: ${values.maxDays} days\nDate folders: ${values.dateFolders ? 'on' : 'off'}`);
}

async function settings() {
  const previous = await loadConfig();
  if (args.length === 0 && (!process.stdin.isTTY || !process.stdout.isTTY)) return printSettings(previous);
  if (args.includes('--host') || args.includes('--port')) throw new Error('Use setup to change host/port and regenerate the paired Shortcut.');
  const config = { ...previous, ...await chooseStorage(previous) };
  await mkdir(config.inbox, { recursive: true, mode: 0o700 });
  await saveConfig(config);
  printSettings(config);
  if (previous.inbox !== config.inbox) console.log(`Folder changed. Existing screenshots remain in ${previous.inbox}; move them separately if needed. Cleanup now manages only the selected folder.`);
  console.log('Saved. The running receiver reads storage settings on its next upload or hourly cleanup. No new Shortcut is needed.');
}

async function setup() {
  if (process.platform !== 'darwin') throw new Error('Setup requires macOS and its Shortcuts app.');
  let previous = {};
  try { await lstat(configPath()); previous = await loadConfig(); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const localName = spawnSync('/usr/sbin/scutil', ['--get', 'LocalHostName'], { encoding: 'utf8' });
  const host = option('--host', previous.host || `${localName.stdout?.trim() || 'localhost'}.local`);
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || host === 'localhost.local') throw new Error('Could not detect the Mac hostname. Run setup --host YOUR-MAC.local or --host LAN-IP.');
  const port = Number(option('--port', previous.port || 4827));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535.');
  const storage = await chooseStorage(previous);
  const token = previous.token || randomBytes(32).toString('hex');
  const state = dirname(configPath());
  await mkdir(storage.inbox, { recursive: true, mode: 0o700 });
  const config = { host, port, ...storage, token };
  await saveConfig(config);
  const unsigned = join(state, 'Send to Codex.unsigned.shortcut');
  const signed = join(state, 'Send to Codex.shortcut');
  await writeFile(unsigned, toPlist(shortcutDefinition({ url: `http://${host}:${port}/upload`, token })), { mode: 0o600 });
  const result = spawnSync('/usr/bin/shortcuts', ['sign', '--mode', 'anyone', '--input', unsigned, '--output', signed], { encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error('Configuration saved, but Apple Shortcuts signing failed. Run setup again with an internet connection and Shortcuts available.');
  await chmod(signed, 0o600);
  console.log('Setup complete.');
  printSettings(config);
  console.log(`Receiver: http://${host}:${port}\nPaired Shortcut: ${signed}\n\nOpen the paired Shortcut on your Mac and add it (replace the older version if updating). If Shortcuts iCloud sync is enabled, it should appear on your iPhone; otherwise transfer this one setup file to your phone.\nNext: npm run install-skill, then npm start.\nThe paired Shortcut contains your private token. Do not publish it.`);
}

async function installSkill() {
  const destination = join(homedir(), '.agents', 'skills', 'screenshot-inbox');
  try {
    const info = await lstat(destination);
    if (!args.includes('--update') || !info.isDirectory() || info.isSymbolicLink()) throw new Error(`A skill already exists at ${destination}. Use install-skill --update for an existing copied skill; symlinks must be managed manually.`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(dirname(destination), { recursive: true });
  const updating = args.includes('--update');
  if (updating) {
    await mkdir(join(destination, 'scripts'), { recursive: true });
    const scripts = await lstat(join(destination, 'scripts'));
    if (!scripts.isDirectory() || scripts.isSymbolicLink()) throw new Error('Refusing to overwrite a symlink in the installed skill.');
    for (const file of ['SKILL.md', 'scripts/inbox.mjs']) {
      const target = join(destination, file);
      try { if ((await lstat(target)).isSymbolicLink()) throw new Error('Refusing to overwrite a symlink in the installed skill.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      await cp(join(root, 'skills', 'screenshot-inbox', file), target);
    }
  } else await cp(join(root, 'skills', 'screenshot-inbox'), destination, { recursive: true, errorOnExist: true, force: false });
  console.log(`Installed: ${destination}\nAsk Codex to use screenshot-inbox to check your latest phone screenshot. If it is not listed, start a new chat or restart Codex.`);
}

async function start() {
  const config = await loadConfig();
  const server = makeReceiver({ ...config, getSettings: loadConfig, onReceive: (filename) => console.log(`Received ${filename}`), onCleanup: (count) => console.log(`Removed ${count} expired/over-limit screenshot(s).`) });
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${config.port} is already in use. Stop the previous receiver or rerun setup with --port.` : `Receiver failed: ${error.code || error.message}`);
    process.exitCode = 1;
  });
  server.listen(config.port, '0.0.0.0', () => {
    console.log(`Screenshot Inbox is listening on port ${config.port}.`);
    printSettings(config);
    console.log('Cleanup runs now, after uploads and hourly while running.\nKeep this terminal running. Use Send to Codex from your iPhone Share Sheet on the same trusted Wi-Fi.\nPress Ctrl+C to stop.');
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => { server.close(); server.closeAllConnections(); });
  }
}

try {
  validateOptions();
  if (command === 'setup') await setup();
  else if (command === 'start') await start();
  else if (command === 'install-skill') await installSkill();
  else if (command === 'settings') await settings();
  else if (command === 'cleanup') {
    const result = await cleanupImages(await loadConfig());
    console.log(`Removed ${result.deleted} screenshot(s); ${result.remaining} remain.`);
  }
  else console.log('Usage: node bin/screenshot-inbox.mjs setup [--yes] [--host MAC.local] [--port 4827]\n       node bin/screenshot-inbox.mjs settings [--inbox PATH] [--max-count 20] [--max-days 7] [--date-folders true|false]\n       node bin/screenshot-inbox.mjs start\n       node bin/screenshot-inbox.mjs cleanup\n       node bin/screenshot-inbox.mjs install-skill [--update]\n       npm run latest');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
