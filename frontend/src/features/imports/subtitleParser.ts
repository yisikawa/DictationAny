import type { ImportSegment } from '../../types';

function parseTimestamp(ts: string): number {
  const parts = ts.trim().replace(',', '.').split(':');
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return (parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s)) * 1000;
  }
  return 0;
}

export function detectFormat(text: string): 'srt' | 'vtt' | 'plain' {
  if (text.trimStart().startsWith('WEBVTT')) return 'vtt';
  if (/^\d+\s*\n\d{2}:\d{2}:\d{2}/m.test(text)) return 'srt';
  return 'plain';
}

export function parseSrt(text: string): ImportSegment[] {
  const blocks = text.trim().split(/\n\s*\n/);
  const segments: ImportSegment[] = [];
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    const timeLine = lines.find(l => l.includes('-->'));
    if (!timeLine) continue;
    const [startStr, endStr] = timeLine.split('-->');
    const textLines = lines.filter(l => l !== timeLine && !/^\d+$/.test(l.trim()));
    const segText = textLines.join(' ').replace(/<[^>]+>/g, '').trim();
    if (!segText) continue;
    segments.push({ startTimeMs: parseTimestamp(startStr), endTimeMs: parseTimestamp(endStr), text: segText });
  }
  return segments;
}

export function parseVtt(text: string): ImportSegment[] {
  const body = text.replace(/^WEBVTT[^\n]*\n/, '').trim();
  return parseSrt(body);
}

export function parsePlain(text: string): ImportSegment[] {
  return text.split(/\n+/).map(l => l.trim()).filter(Boolean).map(t => ({ text: t }));
}

export function parseSubtitle(text: string, format: 'srt' | 'vtt' | 'plain'): ImportSegment[] {
  if (format === 'srt') return parseSrt(text);
  if (format === 'vtt') return parseVtt(text);
  return parsePlain(text);
}
