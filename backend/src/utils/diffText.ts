import type { DiffToken } from '../types';

// これ以上長い文字列は切り詰めて比較する(メモリ・CPU保護)
export const LEVENSHTEIN_MAX_CHARS = 10_000;

export function levenshtein(a: string, b: string): number {
  const s = a.length > LEVENSHTEIN_MAX_CHARS ? a.slice(0, LEVENSHTEIN_MAX_CHARS) : a;
  const t = b.length > LEVENSHTEIN_MAX_CHARS ? b.slice(0, LEVENSHTEIN_MAX_CHARS) : b;
  const m = s.length, n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // 2行のみ保持するローリングDP(メモリ O(n))
  let prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  let curr: number[] = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = s[i - 1] === t[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

export function diffWords(orig: string[], sub: string[]): DiffToken[] {
  const m = orig.length, n = sub.length;

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0) as number[]);
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = orig[i - 1] === sub[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);

  // Backtrack to build raw tokens
  const raw: DiffToken[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && orig[i - 1] === sub[j - 1]) {
      raw.unshift({ type: 'equal', text: orig[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.unshift({ type: 'extra', text: sub[j - 1] });
      j--;
    } else {
      raw.unshift({ type: 'missing', text: orig[i - 1] });
      i--;
    }
  }

  // Merge adjacent missing+extra pairs into replace
  const result: DiffToken[] = [];
  let k = 0;
  while (k < raw.length) {
    if (raw[k].type === 'missing' && k + 1 < raw.length && raw[k + 1].type === 'extra') {
      result.push({ type: 'replace', expected: raw[k].text!, actual: raw[k + 1].text! });
      k += 2;
    } else {
      result.push(raw[k]);
      k++;
    }
  }
  return result;
}
