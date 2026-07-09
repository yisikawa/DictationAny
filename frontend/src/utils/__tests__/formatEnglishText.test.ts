import { describe, it, expect } from 'vitest';
import { formatEnglishText, countFormattingIssues } from '../formatEnglishText';

describe('formatEnglishText', () => {
  it('文の間のスペース欠落を補完する', () => {
    expect(formatEnglishText('It was late.We went home.')).toContain('late. We');
  });

  it('略語を分割しない', () => {
    expect(formatEnglishText('The U.S. is large.')).toContain('U.S.');
    expect(formatEnglishText('See the report, e.g. page 3.')).toContain('e.g.');
  });

  it('URLを分割しない', () => {
    expect(formatEnglishText('Visit example.com for details.')).toContain('example.com');
  });

  it('単独の大文字Lを無条件にIへ置換しない', () => {
    expect(formatEnglishText('Add 50 L of water.')).toContain('50 L');
  });

  it('動詞が続く場合はOCR誤認識のLをIに直す', () => {
    expect(formatEnglishText('L am happy.')).toContain('I am happy');
    expect(formatEnglishText("L'm happy.")).toContain("I'm happy");
    expect(formatEnglishText('Lt was cold.')).toContain('It was cold');
  });

  it('リガチャを展開する', () => {
    expect(formatEnglishText('We ﬁnd a ﬂower.')).toContain('find a flower');
  });
});

describe('countFormattingIssues', () => {
  it('略語を修正件数に数えない', () => {
    expect(countFormattingIssues('The U.S. is large. We agree.')).toBe(0);
  });

  it('文間スペース欠落を数える', () => {
    expect(countFormattingIssues('It was late.We went home.')).toBe(1);
  });
});
