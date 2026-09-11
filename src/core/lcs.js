// Sequence alignment (LCS) and line-level text diff.

// Aligns two arrays by their key function. Returns rows:
// { kind: 'both', a, b } | { kind: 'onlyA', a } | { kind: 'onlyB', b }
export function align(aItems, bItems, keyFn) {
  const n = aItems.length;
  const m = bItems.length;
  // dp[i][j] = LCS length of a[i:] and b[j:]
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const aKeys = aItems.map(keyFn);
  const bKeys = bItems.map(keyFn);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = aKeys[i] === bKeys[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const rows = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (aKeys[i] === bKeys[j]) {
      rows.push({ kind: 'both', a: aItems[i], b: bItems[j] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ kind: 'onlyA', a: aItems[i] });
      i++;
    } else {
      rows.push({ kind: 'onlyB', b: bItems[j] });
      j++;
    }
  }
  while (i < n) rows.push({ kind: 'onlyA', a: aItems[i++] });
  while (j < m) rows.push({ kind: 'onlyB', b: bItems[j++] });
  return rows;
}

// Line diff between two texts. Returns [{ type: 'same'|'add'|'del', text }].
export function lineDiff(aText, bText) {
  const aLines = String(aText ?? '').split('\n');
  const bLines = String(bText ?? '').split('\n');
  const rows = align(aLines, bLines, (l) => l);
  const ops = [];
  for (const row of rows) {
    if (row.kind === 'both') ops.push({ type: 'same', text: row.a });
    else if (row.kind === 'onlyA') ops.push({ type: 'del', text: row.a });
    else ops.push({ type: 'add', text: row.b });
  }
  return ops;
}
