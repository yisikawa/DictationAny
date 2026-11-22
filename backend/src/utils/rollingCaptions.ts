import type { ImportSegment } from '../types';

/** 自動字幕の「直前フレーズのスナップショット」キューは数十msで出力される */
export const ROLLING_SHORT_CUE_MS = 150;

/** 重複判定に使う最大単語数（長すぎる比較を避ける） */
const MAX_OVERLAP_WORDS = 120;

/** 比較用に単語の前後の記号を落として小文字化する */
function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}']+/u, '')
    .replace(/[^\p{L}\p{N}']+$/u, '');
}

function toWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * YouTube の自動字幕（ローリング形式）かどうかを判定する。
 * - インラインの `<c>` / `<00:00:00.000>` タグを含む
 * - 数十msのスナップショットキューが複数ある
 */
export function isRollingCaptionVtt(vtt: string, segments: ImportSegment[]): boolean {
  const shortCues = segments.filter(segment =>
    segment.startTimeMs !== undefined
    && segment.endTimeMs !== undefined
    && segment.endTimeMs - segment.startTimeMs <= ROLLING_SHORT_CUE_MS,
  ).length;

  const hasRollingMarkup = /<c>|<\d{2}:\d{2}:\d{2}\.\d{3}>/.test(vtt);
  return hasRollingMarkup && shortCues >= 3;
}

/**
 * ローリング形式の自動字幕から重複を除去する。
 *
 * YouTube の自動字幕は「直前のフレーズ＋新しいフレーズ」を1キューに入れ、
 * さらに同じ内容を数十msのキューとして重複出力する。ここでは
 *  - 数十msのスナップショットキューを捨てる
 *  - 直前までのテキスト末尾とキューの先頭の重なりを単語単位で取り除く
 * ことで、増分テキストだけを残す。
 */
export function dedupeRollingCaptionSegments(segments: ImportSegment[]): ImportSegment[] {
  const result: ImportSegment[] = [];
  const history: string[] = [];

  for (const segment of segments) {
    const durationMs = segment.startTimeMs !== undefined && segment.endTimeMs !== undefined
      ? segment.endTimeMs - segment.startTimeMs
      : undefined;

    if (durationMs !== undefined && durationMs <= ROLLING_SHORT_CUE_MS) continue;

    const currentWords = toWords(segment.text ?? '');
    if (currentWords.length === 0) continue;

    const previous = result[result.length - 1];

    let overlap = 0;
    const limit = Math.min(history.length, currentWords.length, MAX_OVERLAP_WORDS);
    for (let size = limit; size > 0; size -= 1) {
      let matched = true;
      for (let i = 0; i < size; i += 1) {
        if (history[history.length - size + i] !== normalizeWord(currentWords[i])) {
          matched = false;
          break;
        }
      }
      if (matched) {
        overlap = size;
        break;
      }
    }

    const remaining = currentWords.slice(overlap);
    if (remaining.length === 0) {
      // 完全に重複している場合は直前セグメントの終了時刻だけ延ばす
      if (previous && segment.endTimeMs !== undefined) {
        previous.endTimeMs = segment.endTimeMs;
      }
      continue;
    }

    const text = remaining.join(' ');
    const item: ImportSegment = { text };

    // 重なった分だけキュー内の後半に新しい単語があるため、開始時刻を按分して補間する
    if (segment.startTimeMs !== undefined && segment.endTimeMs !== undefined) {
      const ratio = currentWords.length > 0 ? overlap / currentWords.length : 0;
      item.startTimeMs = Math.round(
        segment.startTimeMs + (segment.endTimeMs - segment.startTimeMs) * ratio,
      );
      item.endTimeMs = segment.endTimeMs;
    } else {
      if (segment.startTimeMs !== undefined) item.startTimeMs = segment.startTimeMs;
      if (segment.endTimeMs !== undefined) item.endTimeMs = segment.endTimeMs;
    }

    result.push(item);

    for (const word of remaining) history.push(normalizeWord(word));
    if (history.length > MAX_OVERLAP_WORDS * 2) {
      history.splice(0, history.length - MAX_OVERLAP_WORDS);
    }
  }

  return result;
}
