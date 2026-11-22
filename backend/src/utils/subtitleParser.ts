import type { ImportSegment } from '../types';

function parseTimestamp(ts: string): number {
  // 例: "00:00:01,000" / "1:02:03.500" / "00:00:01.000 align:start position:0%"
  const match = /(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?/.exec(ts.trim());
  if (!match) return 0;

  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const millis = match[4] ? parseInt(match[4].padEnd(3, '0'), 10) : 0;

  return ((hours * 3600 + minutes * 60 + seconds) * 1000) + millis;
}

export function parseSrt(text: string): ImportSegment[] {
  const blocks = text.trim().split(/\n\s*\n/);
  const segments: ImportSegment[] = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    const timeLine = lines.find(l => l.includes('-->'));
    if (!timeLine) continue;

    const [startStr, endStr] = timeLine.split('-->');
    const textLines = lines.filter(l => l !== timeLine && !/^\d+$/.test(l.trim()));
    const segText = textLines.join(' ').replace(/<[^>]+>/g, '').trim();

    if (!segText) continue;
    segments.push({
      startTimeMs: parseTimestamp(startStr),
      endTimeMs: parseTimestamp(endStr),
      text: segText,
    });
  }

  return segments;
}

export function parseVtt(text: string): ImportSegment[] {
  const body = text.replace(/^WEBVTT[^\n]*\n/, '').trim();
  return parseSrt(body);
}

export function parsePlainText(text: string): ImportSegment[] {
  return text
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => ({ text: line }));
}

export function parseSubtitle(text: string, format: string): ImportSegment[] {
  if (format === 'srt') return parseSrt(text);
  if (format === 'vtt') return parseVtt(text);
  return parsePlainText(text);
}

export function segmentsToBody(segments: ImportSegment[]): string {
  return segments.map(s => s.text).join(' ');
}
