import fs from 'fs';
import os from 'os';
import path from 'path';
import { HttpError } from '../../utils/httpError';
import { ProcessError, runProcess } from '../../utils/processRunner';
import { toTranscriptResult, type WhisperJson } from '../../utils/whisperJson';
import type { SttOptions, SttProvider, TranscriptResult } from './types';

/** WHISPER_EXTRA_ARGS を空白区切りで分解する（"..." で囲まれた引数にも対応） */
function parseExtraArgs(): string[] {
  const raw = process.env.WHISPER_EXTRA_ARGS?.trim();
  if (!raw) return [];
  const parts = raw.match(/"[^"]*"|\S+/g) ?? [];
  return parts.map(part => part.replace(/^"|"$/g, ''));
}

function mapProcessError(err: unknown, bin: string): HttpError {
  if (!(err instanceof ProcessError)) {
    return new HttpError(500, 'STT_ERROR', '音声認識に失敗しました。');
  }
  if (err.code === 'ENOENT') {
    return new HttpError(
      503,
      'STT_UNAVAILABLE',
      `whisper-cli が見つかりません。WHISPER_CPP_BIN を確認してください（指定値: ${bin}）。`,
    );
  }
  if (err.message.includes('タイムアウト')) {
    return new HttpError(504, 'STT_TIMEOUT', err.message);
  }
  if (err.message.includes('中断')) {
    return new HttpError(499, 'STT_ABORTED', err.message);
  }
  const detail = err.stderrTail?.trim();
  return new HttpError(
    500,
    'STT_ERROR',
    `音声認識に失敗しました。${detail ? ` ${detail}` : ''}`.trim(),
  );
}

export const whisperCppProvider: SttProvider = {
  name: 'whisper-cpp',

  async transcribe(audioPath: string, options: SttOptions): Promise<TranscriptResult> {
    const bin = process.env.WHISPER_CPP_BIN ?? 'whisper-cli';
    const modelPath = process.env.WHISPER_MODEL_PATH ?? '';

    if (!modelPath || !fs.existsSync(modelPath)) {
      throw new HttpError(
        503,
        'STT_MODEL_UNAVAILABLE',
        '音声認識モデルが見つかりません。WHISPER_MODEL_PATH を確認してください。',
      );
    }

    const threads = process.env.WHISPER_THREADS
      ?? String(Math.max(1, Math.min(8, os.cpus().length)));
    const timeoutMs = Number(process.env.STT_TIMEOUT_MS ?? 1_800_000);
    const outBase = path.join(
      path.dirname(audioPath),
      `whisper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    const args = [
      '-m', modelPath,
      '-f', audioPath,
      '-l', options.language,
      '-t', threads,
      '-oj',
      '-of', outBase,
      '--print-progress',
      ...parseExtraArgs(),
    ];

    let lastReported = -1;
    try {
      await runProcess(bin, args, {
        signal: options.signal,
        timeoutMs,
        onStderr: (line) => {
          const match = /progress\s*=\s*(\d+)%/.exec(line);
          if (!match) return;
          const percent = Math.min(99, Number(match[1]));
          if (percent > lastReported) {
            lastReported = percent;
            options.onProgress?.(percent);
          }
        },
      });
    } catch (err) {
      throw mapProcessError(err, bin);
    }

    const jsonPath = `${outBase}.json`;
    try {
      const raw = await fs.promises.readFile(jsonPath, 'utf8');
      return toTranscriptResult(JSON.parse(raw) as WhisperJson);
    } catch {
      throw new HttpError(500, 'STT_OUTPUT_ERROR', '音声認識の結果を読み取れませんでした。');
    } finally {
      await fs.promises.unlink(jsonPath).catch(() => { /* 後始末の失敗は無視 */ });
    }
  },
};
