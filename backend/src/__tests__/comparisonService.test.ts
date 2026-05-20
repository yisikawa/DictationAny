import { describe, it, expect } from 'vitest';
import { compare } from '../services/comparisonService';

describe('compare', () => {
  it('完全一致のとき score=100', () => {
    const r = compare({ originalText: 'Hello world', submittedText: 'Hello world' });
    expect(r.score).toBe(100);
    expect(r.wordAccuracy).toBe(100);
    expect(r.characterAccuracy).toBe(100);
  });

  it('大文字小文字を無視する（デフォルト）', () => {
    const r = compare({ originalText: 'Hello World', submittedText: 'hello world' });
    expect(r.score).toBe(100);
  });

  it('単語が一つ抜けているとき missingWords に含まれる', () => {
    const r = compare({
      originalText: 'The city council approved a new plan',
      submittedText: 'The city council approved new plan',
    });
    expect(r.missingWords).toContain('a');
    expect(r.wordAccuracy).toBeLessThan(100);
  });

  it('余分な単語があるとき extraWords に含まれる', () => {
    const r = compare({
      originalText: 'Hello world',
      submittedText: 'Hello beautiful world',
    });
    expect(r.extraWords).toContain('beautiful');
  });

  it('スペルミスが possibleSpellingErrors に含まれる', () => {
    const r = compare({
      originalText: 'approved',
      submittedText: 'approve',
    });
    expect(r.possibleSpellingErrors.some(e => e.expected === 'approved')).toBe(true);
  });

  it('空文字提出で score=0', () => {
    const r = compare({ originalText: 'Hello world', submittedText: '' });
    expect(r.score).toBe(0);
    expect(r.wordAccuracy).toBe(0);
  });

  it('characterAccuracy は負にならない', () => {
    const r = compare({ originalText: 'ab', submittedText: 'xyz xyz xyz xyz xyz' });
    expect(r.characterAccuracy).toBeGreaterThanOrEqual(0);
  });
});
