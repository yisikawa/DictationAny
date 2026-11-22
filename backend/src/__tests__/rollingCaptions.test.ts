import { describe, it, expect } from 'vitest';
import { parseVtt } from '../utils/subtitleParser';
import {
  dedupeRollingCaptionSegments,
  isRollingCaptionVtt,
} from '../utils/rollingCaptions';
import { mergeSegmentsToSentences } from '../utils/whisperJson';

// 実際の YouTube 自動字幕（ローリング形式）と同じ構造の抜粋
const ROLLING_VTT = `WEBVTT
Kind: captions
Language: en

03:02:07.750 --> 03:02:07.760 align:start position:0%
question.


03:02:07.760 --> 03:02:09.990 align:start position:0%
question.
After<03:02:08.160><c> more</c><03:02:08.479><c> practice,</c><03:02:09.120><c> maybe</c><03:02:09.359><c> it</c><03:02:09.600><c> takes</c>

03:02:09.990 --> 03:02:10.000 align:start position:0%
After more practice, maybe it takes


03:02:10.000 --> 03:02:13.429 align:start position:0%
After more practice, maybe it takes
three<03:02:11.120><c> later.</c><03:02:12.160><c> Maybe</c><03:02:12.399><c> your</c><03:02:12.640><c> answer</c><03:02:13.120><c> comes</c>

03:02:13.429 --> 03:02:13.439 align:start position:0%
three later. Maybe your answer comes


03:02:13.439 --> 03:02:17.110 align:start position:0%
three later. Maybe your answer comes
naturally.<03:02:14.640><c> That</c><03:02:15.120><c> is</c><03:02:15.600><c> real</c><03:02:15.720><c> progress.</c>

03:02:17.110 --> 03:02:17.120 align:start position:0%
naturally. That is real progress.
`;

const MANUAL_VTT = `WEBVTT

00:00:01.000 --> 00:00:03.000
I am happy.

00:00:03.000 --> 00:00:05.000
I am tired.
`;

describe('isRollingCaptionVtt', () => {
  it('自動字幕（<c> タグ + 数十msのキュー）をローリング形式と判定する', () => {
    const cues = parseVtt(ROLLING_VTT);
    expect(isRollingCaptionVtt(ROLLING_VTT, cues)).toBe(true);
  });

  it('通常の手動字幕はローリング形式と判定しない', () => {
    const cues = parseVtt(MANUAL_VTT);
    expect(isRollingCaptionVtt(MANUAL_VTT, cues)).toBe(false);
  });
});

describe('dedupeRollingCaptionSegments', () => {
  it('ローリング字幕の重複を除去して増分テキストだけにする', () => {
    const deduped = dedupeRollingCaptionSegments(parseVtt(ROLLING_VTT));
    expect(deduped.map(segment => segment.text)).toEqual([
      'question. After more practice, maybe it takes',
      'three later. Maybe your answer comes',
      'naturally. That is real progress.',
    ]);
  });

  it('文単位に統合すると重複のない文セグメントになる', () => {
    const deduped = dedupeRollingCaptionSegments(parseVtt(ROLLING_VTT));
    const merged = mergeSegmentsToSentences(deduped);
    expect(merged.map(segment => segment.text)).toEqual([
      'question.',
      'After more practice, maybe it takes three later.',
      'Maybe your answer comes naturally.',
      'That is real progress.',
    ]);
  });

  it('手動字幕には適用しない（同じ語で始まる文を消さない）', () => {
    const cues = parseVtt(MANUAL_VTT);
    const merged = mergeSegmentsToSentences(cues);
    expect(merged.map(segment => segment.text)).toEqual(['I am happy.', 'I am tired.']);
  });
});
