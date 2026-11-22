import type { ImportSegment } from '../types';
import type { TranscriptResult } from '../services/stt/types';

export interface WhisperJsonSegment {
  offsets?: { from?: number; to?: number };
  text?: string;
}

export interface WhisperJson {
  transcription?: WhisperJsonSegment[];
}

export type ImportWarningReason = 'low_speech_density';

export interface ImportWarning {
  startTimeMs?: number;
  endTimeMs?: number;
  reason: ImportWarningReason;
}

export interface MergeOptions {
  /** 1セグメントの最大文字数（既定 240） */
  maxChars?: number;
  /** 1セグメントの最大長（既定 12000ms） */
  maxDurationMs?: number;
}

export interface LowDensityOptions {
  /** 判定対象にする最小の長さ（既定 5000ms。これ「超」のみ対象） */
  minDurationMs?: number;
  /** これ未満の文字密度（文字/秒）を警告する（既定 4） */
  minCharsPerSecond?: number;
}

/** [Music] / [BLANK_AUDIO] / (applause) などの非音声タグを除去する */
export function stripNonSpeechTags(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\((?:[^()]*\b(?:music|applause|laughter|silence|noise|inaudible)\b[^()]*)\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSentenceEnd(text: string): boolean {
  return /[.!?]["')\]]?$/.test(text.trim());
}

/**
 * Whisper の句単位セグメントを文単位にまとめる。
 * 文末（. ! ?）・最大文字数・最大長のいずれかで区切る。
 */
export function mergeSegmentsToSentences(
  segments: ImportSegment[],
  options: MergeOptions = {},
): ImportSegment[] {
  const maxChars = options.maxChars ?? 240;
  const maxDurationMs = options.maxDurationMs ?? 12000;

  const merged: ImportSegment[] = [];
  let buffer = '';
  let startTimeMs: number | undefined;
  let endTimeMs: number | undefined;

  const flush = () => {
    const text = buffer.replace(/\s+/g, ' ').trim();
    buffer = '';
    if (!text) {
      startTimeMs = undefined;
      endTimeMs = undefined;
      return;
    }
    const segment: ImportSegment = { text };
    if (startTimeMs !== undefined) segment.startTimeMs = startTimeMs;
    if (endTimeMs !== undefined) segment.endTimeMs = endTimeMs;
    merged.push(segment);
    startTimeMs = undefined;
    endTimeMs = undefined;
  };

  for (const segment of segments) {
    const text = stripNonSpeechTags(segment.text ?? '');
    if (!text) continue;

    buffer = buffer ? `${buffer} ${text}` : text;
    if (startTimeMs === undefined && segment.startTimeMs !== undefined) {
      startTimeMs = segment.startTimeMs;
    }
    if (segment.endTimeMs !== undefined) {
      endTimeMs = segment.endTimeMs;
    }

    const durationMs = startTimeMs !== undefined && endTimeMs !== undefined
      ? endTimeMs - startTimeMs
      : 0;

    if (
      isSentenceEnd(buffer)
      || buffer.length >= maxChars
      || (maxDurationMs > 0 && durationMs >= maxDurationMs)
    ) {
      flush();
    }
  }
  flush();

  return dedupeConsecutiveSegments(merged);
}

/** 連続する完全同一テキスト（Whisper/自動字幕の重複）を除去する */
export function dedupeConsecutiveSegments(segments: ImportSegment[]): ImportSegment[] {
  const deduped: ImportSegment[] = [];
  for (const segment of segments) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.text.toLowerCase() === segment.text.toLowerCase()) continue;
    deduped.push(segment);
  }
  return deduped;
}

/**
 * 「長いのに文字が極端に少ない」セグメントを検出する。
 * Whisper が音声の一部を1文に圧縮して脱落させたケースを拾うための品質ガード。
 */
export function detectLowDensitySegments(
  segments: ImportSegment[],
  options: LowDensityOptions = {},
): ImportWarning[] {
  const minDurationMs = options.minDurationMs ?? 5000;
  const minCharsPerSecond = options.minCharsPerSecond ?? 4;

  const warnings: ImportWarning[] = [];
  for (const segment of segments) {
    if (segment.startTimeMs === undefined || segment.endTimeMs === undefined) continue;
    const durationMs = segment.endTimeMs - segment.startTimeMs;
    if (durationMs <= minDurationMs) continue;
    const charsPerSecond = segment.text.trim().length / (durationMs / 1000);
    if (charsPerSecond < minCharsPerSecond) {
      warnings.push({
        startTimeMs: segment.startTimeMs,
        endTimeMs: segment.endTimeMs,
        reason: 'low_speech_density',
      });
    }
  }
  return warnings;
}

/** whisper.cpp の JSON 出力をアプリ共通の文字起こし結果に変換する */
export function toTranscriptResult(json: WhisperJson): TranscriptResult {
  const segments: ImportSegment[] = [];
  const texts: string[] = [];
  let durationMs = 0;

  for (const item of json.transcription ?? []) {
    const text = stripNonSpeechTags(item.text ?? '');
    if (!text) continue;

    const from = item.offsets?.from;
    const to = item.offsets?.to;
    const segment: ImportSegment = { text };
    if (from !== undefined) segment.startTimeMs = from;
    if (to !== undefined) segment.endTimeMs = to;
    segments.push(segment);

    texts.push(text);
    if (to !== undefined) durationMs = Math.max(durationMs, to);
  }

  return {
    segments,
    text: texts.join(' '),
    durationMs: durationMs > 0 ? durationMs : undefined,
  };
}
