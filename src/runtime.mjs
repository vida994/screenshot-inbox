import { loadConfig } from '../skills/screenshot-inbox/scripts/inbox.mjs';
import { makeReceiver } from './server.mjs';

// One receiver implementation serves both the CLI and the native app.
export async function runReceiver({ desktop = false } = {}) {
  const send = (event) => { if (desktop) process.stdout.write(`${JSON.stringify(event)}\n`); };
  const detachInput = () => { if (desktop) { process.stdin.pause(); process.stdin.destroy(); } };
  if (Number(process.versions.node.split('.')[0]) < 22) {
    send({ event: 'error', code: 'NODE_VERSION' });
    process.exitCode = 64;
    return;
  }
  let config;
  try { config = await loadConfig(); }
  catch {
    send({ event: 'error', code: 'CONFIG' });
    if (!desktop) console.error('Screenshot Inbox is not configured. Run setup first.');
    process.exitCode = 78;
    return;
  }
  const server = makeReceiver({
    ...config,
    getSettings: loadConfig,
    onReceive: (filename) => desktop ? send({ event: 'received' }) : console.log(`Received ${filename}`),
    onCleanup: (count) => desktop ? send({ event: 'cleanup', count }) : console.log(`Removed ${count} expired/over-limit screenshot(s).`),
  });
  let stopping = false;
  function stop() {
    if (stopping) return;
    stopping = true;
    detachInput();
    // Allow current uploads to finish, then bound shutdown to five seconds.
    const timeout = setTimeout(() => server.closeAllConnections(), 5000);
    timeout.unref();
    server.close(() => {
      clearTimeout(timeout);
      send({ event: 'stopped' });
    });
  }
  server.on('error', (error) => {
    send({ event: 'error', code: error.code || 'START' });
    if (!desktop) console.error(error.code === 'EADDRINUSE' ? `Port ${config.port} is already in use. Stop the previous receiver or rerun setup with --port.` : `Receiver failed: ${error.code || 'unexpected error'}`);
    detachInput();
    process.exitCode = error.code === 'EADDRINUSE' ? 98 : 1;
  });
  if (desktop) {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      input += chunk;
      if (input.includes('\n')) {
        if (input.split('\n').some((line) => line.trim() === 'stop')) stop();
        input = input.slice(input.lastIndexOf('\n') + 1);
      }
      if (input.length > 1024) input = '';
    });
    // The child must not survive a crashed/killed GUI parent.
    process.stdin.on('end', stop);
    process.stdin.resume();
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stop);
  server.listen(config.port, '0.0.0.0', () => {
    if (stopping) return;
    if (desktop) send({ event: 'ready', port: config.port });
    else console.log(`Screenshot Inbox is listening on port ${config.port}.\nInbox: ${config.inbox}\nKeep latest: ${config.maxCount}\nMaximum age: ${config.maxDays} days\nDate folders: ${config.dateFolders ? 'on' : 'off'}\nCleanup runs now, after uploads and hourly while running.\nPress Ctrl+C to stop.`);
  });
  return server;
}
