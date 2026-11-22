import type { ImportSegment } from '../../types';

export interface SttOptions {
  /** BCP 47 ではなく ISO 639-1（例: 'en'）に正規化して渡す */
  language: string;
  signal?: AbortSignal;
  /** 進捗（0-100） */
  onProgress?: (percent: number) => void;
}

export interface TranscriptResult {
  /** startTimeMs / endTimeMs 付きのセグメント */
  segments: ImportSegment[];
  /** 全文（ImportJob.rawText 保存用） */
  text: string;
  durationMs?: number;
}

export type SttProviderName = 'whisper-cpp' | 'openai-compatible';

export interface SttProvider {
  readonly name: SttProviderName;
  transcribe(audioPath: string, options: SttOptions): Promise<TranscriptResult>;
}
