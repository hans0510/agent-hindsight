import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { convert, ADAPTERS } from './adapters/index.js';
import { parseJsonl, saveSession, loadSession, listSessions, deleteSession, dataDir } from './store.js';
import { diffEvents } from './core/diff.js';
import { startServer } from './server.js';

const HELP = `agent-hindsight — flight recorder for coding agents

Usage:
  hindsight import <file> [--adapter ${ADAPTERS.join('|')}] [--agent NAME] [--model NAME] [--title TEXT]
  hindsight list
  hindsight show <id> [--raw]
  hindsight diff <idA> <idB> [--json]
  hindsight open [id] [--port N] [--no-open]
  hindsight rm <id>
  hindsight help

Data is stored in $HINDSIGHT_HOME or ~/.hindsight.
`;

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (key === 'no-open' || key === 'raw' || key === 'json') {
        flags[key] = true;
      } else {
        flags[key] = args[++i];
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

function fmtRow(s) {
  const when = s.startedAt ? s.startedAt.replace('T', ' ').slice(0, 16) : '?';
  const title = s.title || s.cwd || '';
  return `${s.id}  ${when}  ${(s.agent || '?').padEnd(12)} ${(s.model || '?').padEnd(24)} ${title}`;
}

function openInBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.unref();
  } catch {
    // headless environment; URL is printed anyway
  }
}

async function cmdImport(args) {
  const { flags, positional } = parseFlags(args);
  const file = positional[0];
  if (!file) throw new Error('usage: hindsight import <file> [--adapter ...]');
  const text = fs.readFileSync(file, 'utf8');
  const lines = parseJsonl(text);
  if (lines.length === 0) throw new Error('no JSON lines found in file');
  const meta = { agent: flags.agent, model: flags.model, title: flags.title, cwd: flags.cwd };
  for (const k of Object.keys(meta)) if (meta[k] === undefined) delete meta[k];
  const { adapter, events } = convert(lines, flags.adapter || 'auto', meta);
  const id = saveSession(events);
  const count = events.length - 1; // minus session header
  console.log(`imported as ${id} (${adapter} adapter, ${count} events)`);
  if (events.skippedLines) console.log(`note: ${events.skippedLines} unrecognized lines were skipped`);
  if (events.invalidLines) console.log(`note: ${events.invalidLines.length} invalid lines were dropped`);
}

function cmdList() {
  const sessions = listSessions();
  if (sessions.length === 0) {
    console.log(`no sessions yet (data dir: ${dataDir()})`);
    return;
  }
  for (const s of sessions) console.log(fmtRow(s));
}

function cmdShow(args) {
  const { flags, positional } = parseFlags(args);
  const id = positional[0];
  const events = id && loadSession(id);
  if (!events) throw new Error(`session not found: ${id || '(missing id)'}`);
  if (flags.raw) {
    for (const e of events) console.log(JSON.stringify(e));
    return;
  }
  for (const e of events) {
    const ts = e.ts ? `[${e.ts.slice(11, 19)}] ` : '';
    switch (e.type) {
      case 'session':
        console.log(`# ${e.agent}${e.model ? ` (${e.model})` : ''} — ${e.title || e.cwd || e.id}`);
        break;
      case 'user':
        console.log(`\n${ts}USER: ${e.text}`);
        break;
      case 'assistant':
        console.log(`${ts}ASSISTANT: ${(e.text || '').slice(0, 500)}`);
        break;
      case 'tool_call': {
        const a = e.args || {};
        const hint = a.command || a.path || a.file_path || a.pattern || JSON.stringify(a).slice(0, 120);
        console.log(`${ts}→ ${e.tool}: ${hint}`);
        break;
      }
      case 'tool_result': {
        const out = String(e.output ?? '');
        const first = out.split('\n')[0].slice(0, 160);
        console.log(`${ts}  ${e.ok === false ? '✗' : '✓'} ${first}${out.length > 160 ? '…' : ''}`);
        break;
      }
      case 'usage':
        console.log(`${ts}(usage: in=${e.input || 0} out=${e.output || 0}${e.cost ? ` cost=$${e.cost}` : ''})`);
        break;
      case 'session_end':
        console.log(`\n# end (${e.status || 'unknown'})`);
        break;
      default:
        console.log(`${ts}${e.type}`);
    }
  }
}

function cmdDiff(args) {
  const { flags, positional } = parseFlags(args);
  const [aId, bId] = positional;
  const a = aId && loadSession(aId);
  const b = bId && loadSession(bId);
  if (!a || !b) throw new Error(`session not found (a=${aId} b=${bId})`);
  const result = diffEvents(a, b);
  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const onlyA = result.rows.filter((r) => r.kind === 'onlyA');
  const onlyB = result.rows.filter((r) => r.kind === 'onlyB');
  const { stats } = result;
  console.log(`A: ${aId} — ${stats.a.toolCalls} tool calls`);
  console.log(`B: ${bId} — ${stats.b.toolCalls} tool calls`);
  console.log(`shared steps: ${stats.matchedSteps}, only in A: ${onlyA.length}, only in B: ${onlyB.length}`);
  const changedFiles = result.files.filter((f) => !f.identical);
  console.log(`files: ${result.files.length} touched, ${changedFiles.length} differ`);
  for (const f of changedFiles) {
    const where = f.inA && f.inB ? 'both, different content' : f.inA ? 'only in A' : 'only in B';
    console.log(`  ~ ${f.path} (${where})`);
  }
  if (onlyA.length > 0) {
    console.log('\nsteps only in A:');
    for (const r of onlyA.slice(0, 20)) console.log(`  A: ${r.a.tool} ${JSON.stringify(r.a.args).slice(0, 100)}`);
  }
  if (onlyB.length > 0) {
    console.log('steps only in B:');
    for (const r of onlyB.slice(0, 20)) console.log(`  B: ${r.b.tool} ${JSON.stringify(r.b.args).slice(0, 100)}`);
  }
  console.log(`\nrun \`hindsight open\` and pick both sessions for the visual diff`);
}

async function cmdOpen(args) {
  const { flags, positional } = parseFlags(args);
  const port = Number(flags.port || 7788);
  const { server } = await startServer(port);
  const id = positional[0];
  const url = `http://127.0.0.1:${port}/${id ? `#session=${id}` : ''}`;
  console.log(`hindsight UI at ${url}`);
  console.log(`ingest API ready: POST /api/ingest/start, POST /api/ingest/:id`);
  if (!flags['no-open']) openInBrowser(url);
  process.on('SIGINT', () => {
    server.close();
    process.exit(0);
  });
}

function cmdRm(args) {
  const { positional } = parseFlags(args);
  const id = positional[0];
  if (!id || !deleteSession(id)) throw new Error(`session not found: ${id || '(missing id)'}`);
  console.log(`deleted ${id}`);
}

export async function main(argv = process.argv.slice(2)) {
  const [cmd, ...rest] = argv;
  try {
    switch (cmd) {
      case 'import': return await cmdImport(rest);
      case 'list': return cmdList();
      case 'show': return cmdShow(rest);
      case 'diff': return cmdDiff(rest);
      case 'open':
      case 'serve': return await cmdOpen(rest);
      case 'rm': return cmdRm(rest);
      case 'help':
      case undefined:
        console.log(HELP);
        return;
      default:
        console.error(`unknown command: ${cmd}\n`);
        console.log(HELP);
        process.exitCode = 1;
    }
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exitCode = 1;
  }
}
