import { describe, it, expect } from 'vitest';
import {
  dedupeConsecutiveSegments,
  detectLowDensitySegments,
  mergeSegmentsToSentences,
  stripNonSpeechTags,
  toTranscriptResult,
} from '../utils/whisperJson';

describe('stripNonSpeechTags', () => {
  it('角括弧・丸括弧の非音声タグを除去する', () => {
    expect(stripNonSpeechTags('[Music] Hello (applause) world')).toBe('Hello world');
  });

  it('無音時の [BLANK_AUDIO] を空文字にする', () => {
    expect(stripNonSpeechTags('[BLANK_AUDIO]')).toBe('');
  });

  it('通常の括弧内の文は残す', () => {
    expect(stripNonSpeechTags('He said (quietly) hello')).toBe('He said (quietly) hello');
  });
});

describe('mergeSegmentsToSentences', () => {
  it('句単位の断片を文単位にまとめる', () => {
    const merged = mergeSegmentsToSentences([
      { startTimeMs: 0, endTimeMs: 1200, text: 'While I nodded,' },
      { startTimeMs: 1200, endTimeMs: 2400, text: 'nearly napping,' },
      { startTimeMs: 2400, endTimeMs: 4000, text: 'suddenly there came a tapping.' },
      { startTimeMs: 4000, endTimeMs: 5000, text: 'Only this, and nothing more.' },
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual({
      startTimeMs: 0,
      endTimeMs: 4000,
      text: 'While I nodded, nearly napping, suddenly there came a tapping.',
    });
    expect(merged[1].text).toBe('Only this, and nothing more.');
  });

  it('maxChars を超えた時点で区切る', () => {
    const merged = mergeSegmentsToSentences(
      [
        { startTimeMs: 0, endTimeMs: 1000, text: 'aaaa bbbb' },
        { startTimeMs: 1000, endTimeMs: 2000, text: 'cccc dddd' },
        { startTimeMs: 2000, endTimeMs: 3000, text: 'eeee.' },
      ],
      { maxChars: 10 },
    );
    expect(merged).toHaveLength(2);
    expect(merged[0].text).toBe('aaaa bbbb cccc dddd');
    expect(merged[1].text).toBe('eeee.');
  });

  it('maxDurationMs を超えたら区切る', () => {
    const merged = mergeSegmentsToSentences(
      [
        { startTimeMs: 0, endTimeMs: 6000, text: 'first part' },
        { startTimeMs: 6000, endTimeMs: 13000, text: 'second part' },
        { startTimeMs: 13000, endTimeMs: 14000, text: 'third.' },
      ],
      { maxDurationMs: 12000 },
    );
    expect(merged).toHaveLength(2);
    expect(merged[0].text).toBe('first part second part');
    expect(merged[1].text).toBe('third.');
  });

  it('連続する完全同一テキストを除去する', () => {
    const merged = mergeSegmentsToSentences([
      { startTimeMs: 0, endTimeMs: 1000, text: 'Thank you.' },
      { startTimeMs: 1000, endTimeMs: 2000, text: 'Thank you.' },
      { startTimeMs: 2000, endTimeMs: 3000, text: 'Next sentence.' },
    ]);
    expect(merged.map(s => s.text)).toEqual(['Thank you.', 'Next sentence.']);
  });

  it('タイムスタンプが無いセグメントも扱える', () => {
    const merged = mergeSegmentsToSentences([{ text: 'Hello world.' }]);
    expect(merged).toEqual([{ text: 'Hello world.' }]);
  });
});

describe('toTranscriptResult', () => {
  it('whisper.cpp の JSON をセグメントに変換する', () => {
    const result = toTranscriptResult({
      transcription: [
        { offsets: { from: 0, to: 1200 }, text: ' Hello world.' },
        { offsets: { from: 1200, to: 2400 }, text: ' [BLANK_AUDIO]' },
        { offsets: { from: 2400, to: 4000 }, text: ' Second sentence.' },
      ],
    });

    expect(result.segments).toEqual([
      { startTimeMs: 0, endTimeMs: 1200, text: 'Hello world.' },
      { startTimeMs: 2400, endTimeMs: 4000, text: 'Second sentence.' },
    ]);
    expect(result.text).toBe('Hello world. Second sentence.');
    expect(result.durationMs).toBe(4000);
  });

  it('空の JSON でも壊れない', () => {
    expect(toTranscriptResult({})).toEqual({ segments: [], text: '', durationMs: undefined });
  });
});

describe('detectLowDensitySegments', () => {
  it('長いのに文字が極端に少ないセグメントを警告する', () => {
    const warnings = detectLowDensitySegments([
      { startTimeMs: 0, endTimeMs: 27760, text: 'Chapter 1.' },
      { startTimeMs: 27760, endTimeMs: 30000, text: 'One of you will betray me.' },
    ]);
    expect(warnings).toEqual([{ startTimeMs: 0, endTimeMs: 27760, reason: 'low_speech_density' }]);
  });

  it('通常のセグメントは警告しない', () => {
    expect(detectLowDensitySegments([
      { startTimeMs: 0, endTimeMs: 8000, text: 'This sentence has plenty of words in it.' },
    ])).toEqual([]);
  });

  it('5秒以下は対象外', () => {
    expect(detectLowDensitySegments([
      { startTimeMs: 0, endTimeMs: 1000, text: 'Hi.' },
    ])).toEqual([]);
  });
});


describe('dedupeConsecutiveSegments', () => {
  it('連続する同一字幕を1つにまとめる', () => {
    const deduped = dedupeConsecutiveSegments([
      { startTimeMs: 0, endTimeMs: 1000, text: 'Hello world.' },
      { startTimeMs: 1000, endTimeMs: 2000, text: 'hello world.' },
      { startTimeMs: 2000, endTimeMs: 3000, text: 'Second.' },
    ]);
    expect(deduped).toHaveLength(2);
    expect(deduped[0].text).toBe('Hello world.');
  });
});
