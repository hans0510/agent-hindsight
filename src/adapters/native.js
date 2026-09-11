import { validateEvent } from '../core/schema.js';

// "Native" adapter: accepts event streams already in the hindsight JSONL format.
// This is what the dsh session-storage plugin and the pi live-capture extension emit,
// so recordings from any harness with a hindsight plugin import without conversion.

export function looksLikeNative(lines) {
  const first = lines.find((l) => l && typeof l === 'object');
  return !!first && first.v === 1 && first.type === 'session';
}

export function convertNative(lines) {
  const bad = [];
  const events = [];
  lines.forEach((line, i) => {
    const problems = validateEvent(line);
    if (problems.length > 0) bad.push({ line: i + 1, problems });
    else events.push(line);
  });
  if (events.length === 0 || events[0].type !== 'session') {
    throw new Error('native import: first event must be a session event');
  }
  if (bad.length > 0) events.invalidLines = bad;
  return events;
}
