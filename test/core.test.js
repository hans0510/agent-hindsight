import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { convert } from '../src/adapters/index.js';
import { parseJsonl, saveSession, loadSession, listSessions, deleteSession } from '../src/store.js';
import { diffEvents } from '../src/core/diff.js';

const claudeFixture = fs.readFileSync(new URL('../examples/claude-session.jsonl', import.meta.url), 'utf8');
const piFixture = fs.readFileSync(new URL('../examples/pi-session.jsonl', import.meta.url), 'utf8');

test('auto-detects and converts a Claude Code transcript', () => {
  const lines = parseJsonl(claudeFixture);
  const { adapter, events } = convert(lines, 'auto');
  assert.equal(adapter, 'claude');
  assert.equal(events[0].type, 'session');
  assert.equal(events[0].agent, 'claude-code');
  assert.equal(events[0].model, 'claude-sonnet-4.5');
  const types = events.map((e) => e.type);
  assert.ok(types.includes('user'));
  assert.ok(types.includes('assistant'));
  const calls = events.filter((e) => e.type === 'tool_call');
  assert.deepEqual(calls.map((c) => c.tool), ['Read', 'Edit', 'Bash']);
  const results = events.filter((e) => e.type === 'tool_result');
  assert.equal(results.length, 3);
  assert.equal(results[0].callId, 'toolu_1');
  const usage = events.filter((e) => e.type === 'usage');
  assert.ok(usage.length >= 3);
});

test('auto-detects and converts a pi session log', () => {
  const lines = parseJsonl(piFixture);
  const { adapter, events } = convert(lines, 'auto');
  assert.equal(adapter, 'pi');
  assert.equal(events[0].agent, 'pi');
  assert.equal(events[0].model, 'deepseek-chat');
  const calls = events.filter((e) => e.type === 'tool_call');
  assert.deepEqual(calls.map((c) => c.tool), ['read', 'bash', 'write', 'bash']);
});

test('diffEvents aligns two runs of the same task', () => {
  const a = convert(parseJsonl(claudeFixture), 'auto').events;
  const b = convert(parseJsonl(piFixture), 'auto').events;
  const d = diffEvents(a, b);
  assert.equal(d.stats.a.toolCalls, 3);
  assert.equal(d.stats.b.toolCalls, 4);
  // cross-harness canonicalization aligns read(index.js) and bash(npm test)
  assert.equal(d.stats.matchedSteps, 2);
  const paths = d.files.map((f) => f.path);
  assert.ok(paths.includes('/home/dev/demo/config.js')); // only pi wrote this
  const cfg = d.files.find((f) => f.path === '/home/dev/demo/config.js');
  assert.equal(cfg.inA, false);
  assert.equal(cfg.inB, true);
});

test('store round-trips a session', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hindsight-test-'));
  process.env.HINDSIGHT_HOME = tmp;
  const events = convert(parseJsonl(piFixture), 'auto').events;
  const id = saveSession(events);
  const loaded = loadSession(id);
  assert.equal(loaded.length, events.length);
  assert.equal(loaded[0].id, id);
  const list = listSessions();
  assert.equal(list.length, 1);
  assert.equal(list[0].agent, 'pi');
  assert.ok(deleteSession(id));
  assert.equal(loadSession(id), null);
  delete process.env.HINDSIGHT_HOME;
});

test('diff of identical sessions is clean', () => {
  const a = convert(parseJsonl(claudeFixture), 'auto').events;
  const b = convert(parseJsonl(claudeFixture), 'auto').events;
  const d = diffEvents(a, b);
  assert.equal(d.stats.matchedSteps, d.stats.a.toolCalls);
  assert.ok(d.files.every((f) => f.identical));
});
