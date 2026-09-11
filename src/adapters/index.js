import { convertClaude, looksLikeClaude } from './claude.js';
import { convertPi, looksLikePi } from './pi.js';
import { convertNative, looksLikeNative } from './native.js';

export const ADAPTERS = ['auto', 'native', 'claude', 'pi'];

// Returns { adapter, events } for parsed JSONL lines.
export function convert(lines, adapter = 'auto', meta = {}) {
  const looks = [
    ['native', looksLikeNative, (l) => convertNative(l)],
    ['claude', looksLikeClaude, (l) => convertClaude(l, meta)],
    ['pi', looksLikePi, (l) => convertPi(l, meta)],
  ];
  if (adapter !== 'auto') {
    const found = looks.find(([name]) => name === adapter);
    if (!found) throw new Error(`unknown adapter: ${adapter} (expected one of ${ADAPTERS.join(', ')})`);
    return { adapter, events: found[2](lines) };
  }
  for (const [name, looksLike, convertFn] of looks) {
    if (looksLike(lines)) return { adapter: name, events: convertFn(lines) };
  }
  throw new Error('could not detect session format; pass --adapter native|claude|pi');
}
