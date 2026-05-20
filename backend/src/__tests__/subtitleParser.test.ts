import { describe, it, expect } from 'vitest';
import { parseSrt, parseVtt, parsePlainText } from '../utils/subtitleParser';

describe('parseSrt', () => {
  it('SRT を正しくパースする', () => {
    const srt = `1\n00:00:01,000 --> 00:00:04,000\nHello world\n\n2\n00:00:05,000 --> 00:00:08,000\nSecond line`;
    const segs = parseSrt(srt);
    expect(segs).toHaveLength(2);
    expect(segs[0].text).toBe('Hello world');
    expect(segs[0].startTimeMs).toBe(1000);
    expect(segs[0].endTimeMs).toBe(4000);
  });

  it('タグを除去する', () => {
    const srt = `1\n00:00:01,000 --> 00:00:04,000\n<i>Hello</i> world`;
    const segs = parseSrt(srt);
    expect(segs[0].text).toBe('Hello world');
  });
});

describe('parseVtt', () => {
  it('WebVTT を正しくパースする', () => {
    const vtt = `WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello world`;
    const segs = parseVtt(vtt);
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toBe('Hello world');
  });
});

describe('parsePlainText', () => {
  it('プレーンテキストを行単位で分割する', () => {
    const text = `Line one\n\nLine two\nLine three`;
    const segs = parsePlainText(text);
    expect(segs).toHaveLength(3);
    expect(segs[0].text).toBe('Line one');
  });
});
