import { makeEvent, makeSessionEvent } from '../core/schema.js';

// Adapter for Claude Code transcripts (~/.claude/projects/<project>/*.jsonl).
// Lines look like:
//   {"type":"user","message":{"role":"user","content":...},"timestamp":...,"cwd":...}
//   {"type":"assistant","message":{"role":"assistant","model":...,"content":[...],"usage":{...}}}

export function looksLikeClaude(lines) {
  return lines.some(
    (l) => (l.type === 'user' || l.type === 'assistant') && l.message && typeof l.message === 'object',
  );
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n');
  }
  return '';
}

export function convertClaude(lines, meta = {}) {
  const events = [];
  let session = makeSessionEvent({ agent: 'claude-code', ...meta });
  let sessionSeen = false;

  for (const line of lines) {
    const ts = line.timestamp || line.ts;
    const msg = line.message || {};

    if (!sessionSeen && (line.cwd || msg.model || line.timestamp)) {
      session = {
        ...session,
        cwd: session.cwd || line.cwd || null,
        model: session.model || msg.model || null,
        startedAt: line.timestamp || session.startedAt,
      };
      sessionSeen = true;
    }

    if (line.type === 'user') {
      const content = msg.content;
      const blocks = Array.isArray(content) ? content : [];
      const toolResults = blocks.filter((b) => b && b.type === 'tool_result');
      if (toolResults.length > 0) {
        for (const tr of toolResults) {
          events.push(makeEvent('tool_result', {
            ts,
            callId: tr.tool_use_id || null,
            ok: tr.is_error ? false : true,
            output: textOf(tr.content) || (typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content ?? '')),
          }));
        }
        continue;
      }
      const text = textOf(content);
      if (text) events.push(makeEvent('user', { ts, text }));
      continue;
    }

    if (line.type === 'assistant') {
      if (msg.model) session.model = session.model || msg.model;
      const blocks = Array.isArray(msg.content) ? msg.content : [];
      const text = blocks
        .filter((b) => b && b.type === 'text')
        .map((b) => b.text || '')
        .join('\n');
      const thinking = blocks
        .filter((b) => b && b.type === 'thinking')
        .map((b) => b.thinking || '')
        .join('\n');
      if (text || thinking) {
        events.push(makeEvent('assistant', { ts, text, thinking: thinking || undefined }));
      }
      for (const b of blocks) {
        if (b && b.type === 'tool_use') {
          events.push(makeEvent('tool_call', { ts, id: b.id || null, tool: b.name, args: b.input ?? {} }));
        }
      }
      if (msg.usage) {
        const u = msg.usage;
        events.push(makeEvent('usage', {
          ts,
          input: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0),
          output: u.output_tokens || 0,
        }));
      }
      continue;
    }
  }

  events.unshift(session);
  events.push(makeEvent('session_end', { status: 'imported' }));
  return events;
}
