import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function dataDir() {
  const dir = process.env.HINDSIGHT_HOME || path.join(os.homedir(), '.hindsight');
  return dir;
}

function sessionsDir() {
  return path.join(dataDir(), 'sessions');
}

export function saveSession(events) {
  const session = events.find((e) => e.type === 'session');
  if (!session) throw new Error('event stream has no session event');
  fs.mkdirSync(sessionsDir(), { recursive: true });
  const file = path.join(sessionsDir(), `${session.id}.jsonl`);
  const body = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(file, body);
  return session.id;
}

export function loadSession(id) {
  const file = path.join(sessionsDir(), `${id}.jsonl`);
  if (!fs.existsSync(file)) return null;
  return parseJsonl(fs.readFileSync(file, 'utf8'));
}

export function parseJsonl(text) {
  const events = [];
  let skipped = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      skipped++;
    }
  }
  if (skipped > 0) events.skipped = skipped;
  return events;
}

export function listSessions() {
  const dir = sessionsDir();
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue;
    const file = path.join(dir, name);
    try {
      const fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(65536);
      const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      const firstLine = buf.subarray(0, bytes).toString('utf8').split('\n')[0];
      const session = JSON.parse(firstLine);
      const stat = fs.statSync(file);
      out.push({
        id: session.id,
        agent: session.agent,
        model: session.model ?? null,
        cwd: session.cwd ?? null,
        title: session.title ?? null,
        startedAt: session.startedAt ?? null,
        bytes: stat.size,
      });
    } catch {
      // skip unreadable entries
    }
  }
  out.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  return out;
}

export function deleteSession(id) {
  const file = path.join(sessionsDir(), `${id}.jsonl`);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}
