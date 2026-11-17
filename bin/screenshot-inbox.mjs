#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, readFile, chmod, cp, lstat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { configPath, loadConfig } from '../skills/screenshot-inbox/scripts/inbox.mjs';
import { makeReceiver } from '../src/server.mjs';
import { shortcutDefinition, toPlist } from '../src/shortcut.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [command, ...args] = process.argv.slice(2);

function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} needs a value.`);
  return args[index + 1];
}

async function setup() {
  if (process.platform !== 'darwin') throw new Error('Setup requires macOS and its Shortcuts app.');
  let previous = {};
  try { previous = JSON.parse(await readFile(configPath(), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const localName = spawnSync('/usr/sbin/scutil', ['--get', 'LocalHostName'], { encoding: 'utf8' });
  const host = option('--host', previous.host || `${localName.stdout?.trim() || 'localhost'}.local`);
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || host === 'localhost.local') throw new Error('Could not detect the Mac hostname. Run setup --host YOUR-MAC.local or --host LAN-IP.');
  const port = Number(option('--port', previous.port || 4827));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535.');
  const inbox = resolve(option('--inbox', previous.inbox || join(homedir(), 'Pictures', 'Screenshot Inbox')));
  const token = previous.token || randomBytes(32).toString('hex');
  const state = dirname(configPath());
  await mkdir(state, { recursive: true, mode: 0o700 });
  await chmod(state, 0o700);
  await mkdir(inbox, { recursive: true, mode: 0o700 });
  const config = { host, port, inbox, token };
  await writeFile(configPath(), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(configPath(), 0o600);
  const unsigned = join(state, 'Send to Codex.unsigned.shortcut');
  const signed = join(state, 'Send to Codex.shortcut');
  await writeFile(unsigned, toPlist(shortcutDefinition({ url: `http://${host}:${port}/upload`, token })), { mode: 0o600 });
  const result = spawnSync('/usr/bin/shortcuts', ['sign', '--mode', 'anyone', '--input', unsigned, '--output', signed], { encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error('Configuration saved, but Apple Shortcuts signing failed. Run setup again with an internet connection and Shortcuts available.');
  await chmod(signed, 0o600);
  console.log(`Setup complete.\nInbox: ${inbox}\nReceiver: http://${host}:${port}\nPaired Shortcut: ${signed}\n\nOpen the paired Shortcut on your Mac and add it. If Shortcuts iCloud sync is enabled, it should appear on your iPhone; otherwise transfer this one setup file to your phone.\nNext: npm run install-skill, then npm start.\nThe paired Shortcut contains your private token. Do not publish it.`);
}

async function installSkill() {
  const destination = join(homedir(), '.agents', 'skills', 'screenshot-inbox');
  try {
    await lstat(destination);
    throw new Error(`A skill already exists at ${destination}. Keep it or remove it manually before reinstalling.`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(dirname(destination), { recursive: true });
  await cp(join(root, 'skills', 'screenshot-inbox'), destination, { recursive: true, errorOnExist: true, force: false });
  console.log(`Installed: ${destination}\nAsk Codex to use screenshot-inbox to check your latest phone screenshot. If it is not listed, start a new chat or restart Codex.`);
}

async function start() {
  const config = await loadConfig();
  const server = makeReceiver({ ...config, onReceive: (filename) => console.log(`Received ${filename}`) });
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${config.port} is already in use. Stop the previous receiver or rerun setup with --port.` : `Receiver failed: ${error.code || error.message}`);
    process.exitCode = 1;
  });
  server.listen(config.port, '0.0.0.0', () => {
    console.log(`Screenshot Inbox is listening on port ${config.port}.\nInbox: ${config.inbox}\nKeep this terminal running. Use Send to Codex from your iPhone Share Sheet on the same trusted Wi-Fi.\nPress Ctrl+C to stop.`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => { server.close(); server.closeAllConnections(); });
  }
}

try {
  if (command === 'setup') await setup();
  else if (command === 'start') await start();
  else if (command === 'install-skill') await installSkill();
  else console.log('Usage: node bin/screenshot-inbox.mjs setup [--host MAC.local] [--port 4827] [--inbox PATH]\n       node bin/screenshot-inbox.mjs start\n       node bin/screenshot-inbox.mjs install-skill\n       npm run latest');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
