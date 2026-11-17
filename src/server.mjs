import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { storageSettings } from '../skills/screenshot-inbox/scripts/inbox.mjs';
import { cleanupImages, uploadDirectory } from './storage.mjs';

export const MAX_BYTES = 20 * 1024 * 1024;

function authorized(header, token) {
  const actual = Buffer.from(header || '');
  const expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function extension(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) && bytes.toString('ascii', 12, 16) === 'IHDR') return 'png';
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9) return 'jpg';
  return null;
}

function respond(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Connection': 'close' });
  res.end(message);
}

export function makeReceiver({ inbox, token, maxCount = 20, maxDays = 7, dateFolders = true, getSettings, maxBytes = MAX_BYTES, cleanupIntervalMs = 60 * 60 * 1000, onReceive = () => {}, onCleanup = () => {} }) {
  const settings = async () => storageSettings(getSettings ? await getSettings() : { inbox, maxCount, maxDays, dateFolders });
  let pending = Promise.resolve();
  let lastReceipt = 0;
  const exclusive = (work) => {
    const task = pending.then(work);
    pending = task.catch(() => {});
    return task;
  };
  const reportCleanup = async (config) => {
    const result = await cleanupImages(config);
    if (result.deleted) onCleanup(result.deleted);
    return result;
  };
  const server = createServer(async (req, res) => {
    try {
      // No browser upload endpoint, public image listing, or image download route.
      if (req.headers.origin || !authorized(req.headers.authorization, token)) return respond(res, 401, 'Pairing token required.');
      if (req.method !== 'POST' || req.url !== '/upload') return respond(res, 404, 'Not found.');
      if (Number(req.headers['content-length']) > maxBytes) return respond(res, 413, 'Image exceeds the 20 MB limit.');
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maxBytes) return respond(res, 413, 'Image exceeds the 20 MB limit.');
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      const ext = extension(bytes);
      if (!ext) return respond(res, 415, 'Send a PNG or JPEG image using the Share Sheet.');
      const filename = await exclusive(async () => {
        const config = await settings();
        // Preserve receipt ordering even when several uploads finish within one millisecond.
        lastReceipt = Math.max(Date.now(), lastReceipt + 1);
        const received = new Date(lastReceipt);
        const directory = await uploadDirectory(config.inbox, config.dateFolders, received);
        const id = randomUUID();
        const timestamp = received.toISOString().replace(/[:.]/g, '-');
        const filename = `screenshot-${timestamp}-${id}.${ext}`;
        const temporary = join(directory, `.${id}.upload`);
        const destination = join(directory, filename);
        try {
          await writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' });
          await rename(temporary, destination);
        } catch (error) {
          await unlink(temporary).catch(() => {});
          throw error;
        }
        // A cleanup error must not turn a successfully saved image into a failed upload.
        await reportCleanup(config).catch((error) => console.error('Cleanup failed:', error.code || 'check folder permissions'));
        return filename;
      });
      onReceive(filename);
      respond(res, 201, 'Screenshot saved. Ready for Codex.');
    } catch (error) {
      if (!res.headersSent && !res.destroyed) respond(res, 500, 'Could not save the screenshot. Check the screenshot folder permissions.');
      // Avoid logging request headers, image contents or pairing credentials.
      console.error('Upload failed:', error.code || 'unexpected error');
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.maxConnections = 8;
  server.cleanupNow = () => exclusive(async () => reportCleanup(await settings()));
  let timer;
  const scheduledCleanup = () => server.cleanupNow().catch((error) => console.error('Cleanup failed:', error.code || 'check settings and folder permissions'));
  server.once('listening', () => {
    scheduledCleanup();
    timer = setInterval(scheduledCleanup, cleanupIntervalMs);
    timer.unref();
  });
  server.once('close', () => clearInterval(timer));
  return server;
}
