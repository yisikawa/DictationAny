import { formatEnglishText } from '../../utils/formatEnglishText';
import type { ImportSegment } from '../../types';

export type EditableSegment = ImportSegment & { deleted?: boolean };

export function formatSegmentTime(ms?: number): string {
  if (ms === undefined) return '';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** 削除・空行を除き、必要なら英文整形を適用して保存用セグメントを作る */
export function toSavableSegments(
  segments: EditableSegment[],
  applyFormatting: boolean,
): ImportSegment[] {
  return segments
    .filter(segment => !segment.deleted && segment.text.trim().length > 0)
    .map((segment) => {
      const item: ImportSegment = {
        text: applyFormatting ? formatEnglishText(segment.text) : segment.text,
      };
      if (segment.startTimeMs !== undefined) item.startTimeMs = segment.startTimeMs;
      if (segment.endTimeMs !== undefined) item.endTimeMs = segment.endTimeMs;
      return item;
    });
}
