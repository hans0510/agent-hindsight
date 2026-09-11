/* global fetch, location, document */

const $ = (sel) => document.querySelector(sel);

const state = {
  sessions: [],
  currentId: null,
};

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function argHint(tool, args) {
  if (!args || typeof args !== 'object') return '';
  return args.command || args.path || args.file_path || args.pattern || args.url || JSON.stringify(args).slice(0, 140);
}

function timeOf(e) {
  return e.ts ? e.ts.slice(11, 19) : '';
}

async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

async function loadList() {
  const { sessions } = await api('/api/sessions');
  state.sessions = sessions;
  const list = $('#session-list');
  if (sessions.length === 0) {
    list.innerHTML = '<p class="empty" style="padding:0 8px">no sessions yet — import one with <code>hindsight import</code></p>';
    return;
  }
  list.innerHTML = sessions
    .map(
      (s) => `
      <div class="session-item" data-id="${esc(s.id)}">
        <div class="title">${esc(s.title || s.cwd || s.id)}</div>
        <div class="meta">${esc(s.agent || '?')} · ${esc(s.model || '?')} · ${esc((s.startedAt || '').slice(0, 16).replace('T', ' '))}</div>
      </div>`,
    )
    .join('');
  for (const el of list.querySelectorAll('.session-item')) {
    el.addEventListener('click', () => {
      location.hash = `session=${el.dataset.id}`;
    });
  }
  const a = $('#diff-a');
  const b = $('#diff-b');
  const opts = sessions.map((s) => `<option value="${esc(s.id)}">${esc(s.id)} — ${esc(s.title || s.agent || '')}</option>`).join('');
  a.innerHTML = opts;
  b.innerHTML = opts;
  if (sessions.length > 1) b.selectedIndex = 1;
}

function pairResults(events) {
  // match tool_result events onto their tool_call for display
  const byCall = new Map();
  for (const e of events) {
    if (e.type === 'tool_result' && e.callId) byCall.set(e.callId, e);
  }
  return { byCall };
}

function renderTimeline(events) {
  const tl = $('#timeline');
  const session = events.find((e) => e.type === 'session') || {};
  const { byCall } = pairResults(events);

  const usage = { input: 0, output: 0 };
  let toolCalls = 0;
  for (const e of events) {
    if (e.type === 'usage') {
      usage.input += e.input || 0;
      usage.output += e.output || 0;
    }
    if (e.type === 'tool_call') toolCalls++;
  }

  $('#session-header').innerHTML = `
    <h2>${esc(session.title || session.cwd || session.id || 'session')}</h2>
    <div class="meta">${esc(session.agent || '?')} · ${esc(session.model || '?')} · started ${esc((session.startedAt || '').replace('T', ' ').slice(0, 19))}</div>
    <div class="stats"><span>${toolCalls} tool calls</span><span>tokens in ${usage.input} / out ${usage.output}</span></div>
  `;

  const html = [];
  for (const e of events) {
    switch (e.type) {
      case 'user':
        html.push(`<div class="ev user"><div class="who">USER · ${timeOf(e)}</div><pre>${esc(e.text)}</pre></div>`);
        break;
      case 'assistant':
        if (!e.text && !e.thinking) break;
        html.push(`<div class="ev assistant"><div class="who">ASSISTANT · ${timeOf(e)}</div><pre>${esc(e.text || e.thinking)}</pre></div>`);
        break;
      case 'tool_call': {
        const result = (e.id && byCall.get(e.id)) || null;
        const ok = result ? result.ok !== false : null;
        const badge = ok === null ? '' : ok ? ' ✓' : ' ✗';
        const resultHtml = result
          ? `<details><summary>output${result.ok === false ? ' (error)' : ''}</summary><pre class="${result.ok === false ? 'result-err' : ''}">${esc(String(result.output ?? '').slice(0, 20000))}</pre></details>`
          : '';
        html.push(`<div class="ev tool"><div class="who">${timeOf(e)}</div><span class="toolname">${esc(e.tool)}</span>${badge} <span class="arg-hint">${esc(argHint(e.tool, e.args))}</span>${resultHtml}</div>`);
        break;
      }
      case 'tool_result': {
        // orphan result (no matching call shown)
        const orphan = !e.callId;
        if (orphan) {
          html.push(`<div class="ev tool"><div class="who">${timeOf(e)}</div><details><summary>tool output</summary><pre>${esc(String(e.output ?? '').slice(0, 20000))}</pre></details></div>`);
        }
        break;
      }
      case 'usage':
        html.push(`<div class="ev usage">tokens: in ${e.input || 0} / out ${e.output || 0}${e.cost ? ` · $${e.cost}` : ''}</div>`);
        break;
      case 'session_end':
        html.push(`<div class="ev usage">— session end (${esc(e.status || 'unknown')}) —</div>`);
        break;
    }
  }
  tl.innerHTML = html.join('') || '<p class="empty">empty session</p>';
}

async function showSession(id) {
  state.currentId = id;
  for (const el of document.querySelectorAll('.session-item')) {
    el.classList.toggle('active', el.dataset.id === id);
  }
  const { events } = await api(`/api/sessions/${encodeURIComponent(id)}`);
  renderTimeline(events);
}

function stepLabel(step) {
  if (!step) return '';
  return `${step.tool} ${argHint(step.tool, step.args)}`;
}

function renderLineDiff(aText, bText) {
  // simple LCS line diff (client-side copy, keeps server payload small)
  const a = String(aText ?? '').split('\n');
  const b = String(bText ?? '').split('\n');
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const lines = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { lines.push({ t: 'same', x: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { lines.push({ t: 'del', x: a[i++] }); }
    else { lines.push({ t: 'add', x: b[j++] }); }
  }
  while (i < n) lines.push({ t: 'del', x: a[i++] });
  while (j < m) lines.push({ t: 'add', x: b[j++] });
  return lines.map((l) => `<div class="line ${l.t}">${l.t === 'add' ? '+ ' : l.t === 'del' ? '- ' : '  '}${esc(l.x)}</div>`).join('');
}

async function runDiff() {
  const a = $('#diff-a').value;
  const b = $('#diff-b').value;
  const out = $('#diff-result');
  if (!a || !b) return;
  out.innerHTML = '<p class="empty">comparing…</p>';
  const d = await api(`/api/diff?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
  const changedFiles = d.files.filter((f) => !f.identical);

  const cards = `
    <div class="diff-summary">
      <div class="diff-card"><div class="num">${d.stats.a.toolCalls}</div><div class="lbl">tool calls in A</div></div>
      <div class="diff-card"><div class="num">${d.stats.b.toolCalls}</div><div class="lbl">tool calls in B</div></div>
      <div class="diff-card"><div class="num">${d.stats.matchedSteps}</div><div class="lbl">shared steps</div></div>
      <div class="diff-card"><div class="num">${changedFiles.length}</div><div class="lbl">files differ</div></div>
    </div>`;

  const rows = d.rows
    .map((r) => {
      if (r.kind === 'both') {
        return `<div class="diff-row"><div class="diff-cell">${esc(stepLabel(r.a))}</div><div class="diff-cell">${esc(stepLabel(r.b))}</div></div>`;
      }
      if (r.kind === 'onlyA') {
        return `<div class="diff-row"><div class="diff-cell onlyA">${esc(stepLabel(r.a))}</div><div class="diff-cell empty">—</div></div>`;
      }
      return `<div class="diff-row"><div class="diff-cell empty">—</div><div class="diff-cell onlyB">${esc(stepLabel(r.b))}</div></div>`;
    })
    .join('');

  const files = changedFiles
    .map((f) => {
      let body;
      if (f.inA && f.inB) body = renderLineDiff(f.a, f.b);
      else if (f.inA) body = `<div class="lines">${renderLineDiff(f.a, '')}</div>`;
      else body = `<div class="lines">${renderLineDiff('', f.b)}</div>`;
      const note = f.inA && f.inB ? '' : f.inA ? ' (only in A)' : ' (only in B)';
      return `<div class="filediff"><h3>${esc(f.path)}${note}</h3>${body.startsWith('<div class="lines"') ? body : `<div class="lines">${body}</div>`}</div>`;
    })
    .join('');

  out.innerHTML = cards + `<h3>tool-call alignment</h3>` + (rows || '<p class="empty">no tool calls</p>') + files;
  location.hash = `diff=${a},${b}`;
}

function switchMode(mode) {
  $('#btn-replay').classList.toggle('active', mode === 'replay');
  $('#btn-diff').classList.toggle('active', mode === 'diff');
  $('#replay-view').classList.toggle('hidden', mode !== 'replay');
  $('#diff-view').classList.toggle('hidden', mode !== 'diff');
}

async function route() {
  const hash = location.hash.slice(1);
  if (hash.startsWith('diff=')) {
    const [a, b] = hash.slice(5).split(',');
    switchMode('diff');
    if (a) $('#diff-a').value = a;
    if (b) $('#diff-b').value = b;
    if (a && b) await runDiff();
    return;
  }
  if (hash.startsWith('session=')) {
    switchMode('replay');
    await showSession(hash.slice(8));
    return;
  }
  switchMode('replay');
  if (state.sessions.length > 0 && !state.currentId) {
    location.hash = `session=${state.sessions[0].id}`;
  }
}

async function boot() {
  $('#btn-replay').addEventListener('click', () => switchMode('replay'));
  $('#btn-diff').addEventListener('click', () => switchMode('diff'));
  $('#diff-run').addEventListener('click', runDiff);
  window.addEventListener('hashchange', route);
  await loadList();
  await route();
}

boot().catch((err) => {
  $('#timeline').innerHTML = `<p class="empty">failed to load: ${esc(err.message)}</p>`;
});
