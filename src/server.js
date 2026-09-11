import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSessions, loadSession, saveSession, deleteSession } from './store.js';
import { diffEvents } from './core/diff.js';
import { makeSessionEvent, validateEvent, FORMAT_VERSION } from './core/schema.js';

const WEB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const STATIC_FILES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/app.js', 'app.js'],
  ['/style.css', 'style.css'],
]);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(data);
}

function readBody(req, limit = 50 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function appendEvents(id, events) {
  const existing = loadSession(id);
  if (!existing) return null;
  // insert before a trailing session_end if present
  const tail = existing[existing.length - 1];
  const rows = tail && tail.type === 'session_end' ? existing.slice(0, -1) : existing;
  rows.push(...events);
  if (tail && tail.type === 'session_end') rows.push(tail);
  saveSession(rows);
  return events.length;
}

export function createServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const p = url.pathname;

      if (req.method === 'GET' && STATIC_FILES.has(p)) {
        const name = STATIC_FILES.get(p);
        const file = path.join(WEB_DIR, name);
        const ext = path.extname(name);
        res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
        return;
      }

      if (req.method === 'GET' && p === '/api/health') {
        sendJson(res, 200, { ok: true, v: FORMAT_VERSION });
        return;
      }

      if (req.method === 'GET' && p === '/api/sessions') {
        sendJson(res, 200, { sessions: listSessions() });
        return;
      }

      const sessionMatch = p.match(/^\/api\/sessions\/([A-Za-z0-9_-]+)$/);
      if (req.method === 'GET' && sessionMatch) {
        const events = loadSession(sessionMatch[1]);
        if (!events) return sendJson(res, 404, { error: 'not found' });
        sendJson(res, 200, { events });
        return;
      }
      if (req.method === 'DELETE' && sessionMatch) {
        if (!deleteSession(sessionMatch[1])) return sendJson(res, 404, { error: 'not found' });
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === 'GET' && p === '/api/diff') {
        const a = url.searchParams.get('a');
        const b = url.searchParams.get('b');
        const aEvents = a && loadSession(a);
        const bEvents = b && loadSession(b);
        if (!aEvents || !bEvents) return sendJson(res, 404, { error: 'session not found', a: !!aEvents, b: !!bEvents });
        sendJson(res, 200, diffEvents(aEvents, bEvents));
        return;
      }

      // Ingest API for harness plugins (pi extension, dsh session-storage plugin):
      // POST /api/ingest/start {agent, model, cwd, title} -> {id}
      // POST /api/ingest/:id     {events:[...]}           -> {appended}
      if (req.method === 'POST' && p === '/api/ingest/start') {
        const body = JSON.parse((await readBody(req)) || '{}');
        const session = makeSessionEvent(body);
        saveSession([session]);
        sendJson(res, 200, { id: session.id });
        return;
      }
      const ingestMatch = p.match(/^\/api\/ingest\/([A-Za-z0-9_-]+)$/);
      if (req.method === 'POST' && ingestMatch) {
        const body = JSON.parse((await readBody(req)) || '{}');
        const events = Array.isArray(body.events) ? body.events : [];
        const bad = [];
        for (const e of events) {
          const problems = validateEvent(e);
          if (problems.length > 0) bad.push({ event: e, problems });
        }
        if (bad.length > 0) return sendJson(res, 400, { error: 'invalid events', bad });
        const appended = appendEvents(ingestMatch[1], events);
        if (appended === null) return sendJson(res, 404, { error: 'not found' });
        sendJson(res, 200, { appended });
        return;
      }

      sendJson(res, 404, { error: 'not found' });
    } catch (err) {
      sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
    }
  });
  return server;
}

export function startServer(port = 7788) {
  const server = createServer();
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, port }));
  });
}
