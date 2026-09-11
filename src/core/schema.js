// Normalized session event format ("hindsight JSONL"): one JSON object per line.
// First line is always a `session` event carrying metadata; the rest are ordered events.

export const FORMAT_VERSION = 1;

export const EVENT_TYPES = [
  'session',
  'user',
  'assistant',
  'tool_call',
  'tool_result',
  'file_edit',
  'usage',
  'session_end',
];

export function makeEvent(type, fields = {}) {
  return { v: FORMAT_VERSION, type, ts: new Date().toISOString(), ...fields };
}

export function makeSessionEvent(meta = {}) {
  return makeEvent('session', {
    id: meta.id || makeSessionId(),
    agent: meta.agent || 'unknown',
    model: meta.model || null,
    cwd: meta.cwd || null,
    title: meta.title || null,
    startedAt: meta.startedAt || new Date().toISOString(),
  });
}

export function makeSessionId() {
  return 'hs_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// Returns a list of problems; empty array means valid.
export function validateEvent(e) {
  const problems = [];
  if (typeof e !== 'object' || e === null) return ['not an object'];
  if (!EVENT_TYPES.includes(e.type)) problems.push(`unknown type: ${e.type}`);
  if (e.type === 'session' && !e.id) problems.push('session event missing id');
  if (e.type === 'tool_call' && !e.tool) problems.push('tool_call missing tool');
  return problems;
}

// Stable stringify for comparing tool arguments regardless of key order.
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}
