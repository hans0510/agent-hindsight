import { makeEvent, makeSessionEvent } from '../core/schema.js';

// Adapter for pi (pi-mono / pi-coding-agent) session logs.
// Pi sessions are JSONL; event field names have shifted across versions, so this
// adapter accepts the common shapes defensively and ignores what it can't map.

export function looksLikePi(lines) {
  return lines.some(
    (l) =>
      l &&
      (l.type === 'tool_call' || l.type === 'tool_result' || l.type === 'message' || l.type === 'session') &&
      l.v === undefined,
  );
}

function asText(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === 'string' ? b : b?.text || b?.content || ''))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof content === 'object') return content.text || JSON.stringify(content);
  return String(content);
}

export function convertPi(lines, meta = {}) {
  const events = [];
  const session = makeSessionEvent({ agent: 'pi', ...meta });
  let skipped = 0;

  for (const line of lines) {
    if (!line || typeof line !== 'object') {
      skipped++;
      continue;
    }
    const ts = line.ts || line.timestamp;
    switch (line.type) {
      case 'session': {
        if (line.model) session.model = session.model || line.model;
        if (line.cwd) session.cwd = session.cwd || line.cwd;
        if (ts) session.startedAt = ts;
        break;
      }
      case 'message': {
        const role = line.role;
        const text = asText(line.content ?? line.text);
        if (role === 'user') events.push(makeEvent('user', { ts, text }));
        else if (role === 'assistant') events.push(makeEvent('assistant', { ts, text }));
        else skipped++;
        break;
      }
      case 'tool_call': {
        events.push(makeEvent('tool_call', {
          ts,
          id: line.id || line.callId || null,
          tool: line.tool || line.name,
          args: line.args ?? line.arguments ?? {},
        }));
        break;
      }
      case 'tool_result': {
        events.push(makeEvent('tool_result', {
          ts,
          callId: line.callId || line.tool_call_id || line.id || null,
          ok: line.ok ?? !line.error,
          output: asText(line.output ?? line.content ?? line.result),
        }));
        break;
      }
      case 'usage': {
        events.push(makeEvent('usage', {
          ts,
          input: line.input ?? line.inputTokens ?? 0,
          output: line.output ?? line.outputTokens ?? 0,
          cost: line.cost ?? 0,
        }));
        break;
      }
      default:
        skipped++;
    }
  }

  events.unshift(session);
  events.push(makeEvent('session_end', { status: 'imported' }));
  if (skipped > 0) events.skippedLines = skipped;
  return events;
}
