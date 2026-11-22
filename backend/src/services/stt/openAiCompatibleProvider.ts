import fs from 'fs';
import path from 'path';
import type { ImportSegment } from '../../types';
import { HttpError } from '../../utils/httpError';
import { stripNonSpeechTags } from '../../utils/whisperJson';
import type { SttOptions, SttProvider, TranscriptResult } from './types';

interface VerboseJsonResponse {
  text?: string;
  duration?: number;
  segments?: { start?: number; end?: number; text?: string }[];
}

function mapHttpStatus(status: number, body: string): HttpError {
  if (status === 401 || status === 403) {
    return new HttpError(502, 'STT_AUTH_ERROR', 'STT API の認証に失敗しました。STT_API_KEY を確認してください。');
  }
  if (status === 429) {
    return new HttpError(503, 'STT_RATE_LIMITED', 'STT API のレート制限に達しました。時間をおいて再試行してください。');
  }
  if (status === 413) {
    return new HttpError(413, 'AUDIO_TOO_LONG', '音声が STT API の上限サイズを超えています。分割して取り込んでください。');
  }
  const detail = body.slice(0, 500).trim();
  return new HttpError(
    502,
    'STT_UPSTREAM_ERROR',
    `STT API がエラーを返しました (${status})${detail ? `: ${detail}` : ''}`,
  );
}

export const openAiCompatibleProvider: SttProvider = {
  name: 'openai-compatible',

  async transcribe(audioPath: string, options: SttOptions): Promise<TranscriptResult> {
    const baseUrl = (process.env.STT_BASE_URL ?? 'http://localhost:8000/v1').replace(/\/+$/, '');
    const model = process.env.STT_MODEL ?? 'whisper-1';
    const apiKey = process.env.STT_API_KEY ?? '';
    const timeoutMs = Number(process.env.STT_TIMEOUT_MS ?? 1_800_000);

    const buffer = await fs.promises.readFile(audioPath);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: 'audio/wav' }), path.basename(audioPath));
    form.append('model', model);
    form.append('language', options.language);
    form.append('response_format', 'verbose_json');

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([timeoutSignal, options.signal])
      : timeoutSignal;

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
        body: form,
        signal,
      });
    } catch (err) {
      if (options.signal?.aborted) {
        throw new HttpError(499, 'STT_ABORTED', 'クライアントによって中断されました。');
      }
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('TimeoutError') || message.includes('timed out')) {
        throw new HttpError(504, 'STT_TIMEOUT', 'STT API の応答がタイムアウトしました。');
      }
      throw new HttpError(
        503,
        'STT_UNAVAILABLE',
        `STT API に接続できません（${baseUrl}）。サーバーが起動しているか確認してください。`,
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw mapHttpStatus(response.status, body);
    }

    const data = (await response.json()) as VerboseJsonResponse;
    const segments: ImportSegment[] = [];
    const texts: string[] = [];

    for (const item of data.segments ?? []) {
      const text = stripNonSpeechTags(item.text ?? '');
      if (!text) continue;
      const segment: ImportSegment = { text };
      if (item.start !== undefined) segment.startTimeMs = Math.round(item.start * 1000);
      if (item.end !== undefined) segment.endTimeMs = Math.round(item.end * 1000);
      segments.push(segment);
      texts.push(text);
    }

    const text = stripNonSpeechTags(data.text ?? texts.join(' '));
    return {
      segments,
      text,
      durationMs: data.duration !== undefined ? Math.round(data.duration * 1000) : undefined,
    };
  },
};
