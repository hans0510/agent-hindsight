import test from 'node:test';
import assert from 'node:assert/strict';
import { align, lineDiff } from '../src/core/lcs.js';

test('align matches shared subsequences in order', () => {
  const rows = align(['a', 'b', 'c'], ['b', 'c', 'd'], (x) => x);
  assert.deepEqual(
    rows.map((r) => r.kind),
    ['onlyA', 'both', 'both', 'onlyB'],
  );
  assert.equal(rows[1].a, 'b');
  assert.equal(rows[3].b, 'd');
});

test('lineDiff marks added and removed lines', () => {
  const ops = lineDiff('one\ntwo\nthree', 'one\nTWO\nthree');
  const adds = ops.filter((o) => o.type === 'add').map((o) => o.text);
  const dels = ops.filter((o) => o.type === 'del').map((o) => o.text);
  assert.deepEqual(adds, ['TWO']);
  assert.deepEqual(dels, ['two']);
  assert.equal(ops.filter((o) => o.type === 'same').length, 2);
});
