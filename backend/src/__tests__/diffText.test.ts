import { describe, it, expect } from 'vitest';
import { levenshtein, LEVENSHTEIN_MAX_CHARS, diffWords } from '../utils/diffText';

describe('levenshtein', () => {
  it('基本的な編集距離を返す', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('空文字列を扱える', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('', '')).toBe(0);
  });

  it('上限文字数の定数をエクスポートしている', () => {
    expect(LEVENSHTEIN_MAX_CHARS).toBe(10_000);
  });

  it('長大な入力でもクラッシュせず妥当な時間で完了する', () => {
    const a = 'abcdefghij'.repeat(5_000); // 50,000文字
    const b = 'abcdefghix'.repeat(5_000); // 50,000文字
    const start = Date.now();
    const dist = levenshtein(a, b);
    expect(Date.now() - start).toBeLessThan(5_000);
    // 上限で切り詰められるため、距離は上限以下
    expect(dist).toBeLessThanOrEqual(LEVENSHTEIN_MAX_CHARS);
    expect(dist).toBeGreaterThan(0);
  });
});

describe('diffWords', () => {
  it('既存の挙動を維持する(equal/missing/extra/replace)', () => {
    const result = diffWords(['the', 'quick', 'fox'], ['the', 'slow', 'fox']);
    expect(result).toEqual([
      { type: 'equal', text: 'the' },
      { type: 'replace', expected: 'quick', actual: 'slow' },
      { type: 'equal', text: 'fox' },
    ]);
  });
});
