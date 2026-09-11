import { align } from './lcs.js';
import { stableStringify } from './schema.js';

const EDIT_TOOLS = new Set([
  'edit', 'write', 'multiedit', 'multi_edit', 'notebookedit',
  'Edit', 'Write', 'MultiEdit', 'NotebookEdit',
]);

function toolPath(args) {
  if (!args || typeof args !== 'object') return null;
  return args.path || args.file_path || args.filePath || args.notebook_path || null;
}

// Tool names and argument keys differ across harnesses (Read vs read, file_path
// vs path); canonicalize so the same action in different harnesses aligns.
const ARG_KEY_ALIASES = {
  file_path: 'path',
  filepath: 'path',
  filePath: 'path',
  notebook_path: 'path',
};

function canonicalTool(name) {
  return String(name || '').toLowerCase();
}

function canonicalArgs(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return args ?? {};
  const out = {};
  for (const [k, v] of Object.entries(args)) {
    out[ARG_KEY_ALIASES[k] || k] = v;
  }
  return out;
}

// Extract comparable "steps" (tool calls) from an event stream.
export function extractSteps(events) {
  return events
    .filter((e) => e.type === 'tool_call')
    .map((e) => ({
      tool: e.tool,
      args: e.args ?? {},
      key: `${canonicalTool(e.tool)}:${stableStringify(canonicalArgs(e.args))}`,
    }));
}

// Reconstruct per-file final content from edit/write tool calls, in order.
// Returns Map<path, string> of the last known content written per file.
export function extractFileStates(events) {
  const files = new Map();
  for (const e of events) {
    if (e.type === 'file_edit' && e.path != null) {
      files.set(e.path, e.after ?? '');
      continue;
    }
    if (e.type !== 'tool_call') continue;
    if (!EDIT_TOOLS.has(e.tool)) continue;
    const path = toolPath(e.args);
    if (!path) continue;
    const args = e.args ?? {};
    const content = args.content ?? args.new_string ?? args.newString ?? args.new_source ?? null;
    if (content != null) files.set(path, content);
  }
  return files;
}

export function summarizeUsage(events) {
  let input = 0;
  let output = 0;
  let cost = 0;
  let has = false;
  for (const e of events) {
    if (e.type !== 'usage') continue;
    has = true;
    input += e.input || 0;
    output += e.output || 0;
    cost += e.cost || 0;
  }
  return has ? { input, output, cost } : null;
}

export function toolCallCounts(events) {
  const counts = {};
  for (const e of events) {
    if (e.type === 'tool_call') counts[e.tool] = (counts[e.tool] || 0) + 1;
  }
  return counts;
}

// Diff two event streams. Returns alignment rows plus file-level and stat-level diffs.
export function diffEvents(aEvents, bEvents) {
  const aSteps = extractSteps(aEvents);
  const bSteps = extractSteps(bEvents);
  const rows = align(aSteps, bSteps, (s) => s.key);

  const aFiles = extractFileStates(aEvents);
  const bFiles = extractFileStates(bEvents);
  const allPaths = [...new Set([...aFiles.keys(), ...bFiles.keys()])].sort();
  const fileDiffs = allPaths.map((path) => ({
    path,
    inA: aFiles.has(path),
    inB: bFiles.has(path),
    identical: aFiles.get(path) === bFiles.get(path),
    a: aFiles.get(path) ?? null,
    b: bFiles.get(path) ?? null,
  }));

  return {
    rows,
    stats: {
      a: { toolCalls: aSteps.length, usage: summarizeUsage(aEvents), tools: toolCallCounts(aEvents) },
      b: { toolCalls: bSteps.length, usage: summarizeUsage(bEvents), tools: toolCallCounts(bEvents) },
      matchedSteps: rows.filter((r) => r.kind === 'both').length,
    },
    files: fileDiffs,
  };
}
