import crypto from 'crypto';
import path from 'path';
import { HttpError } from './httpError';
import { ProcessError, runProcess } from './processRunner';
import { AUDIO_TMP_DIR, ensureAudioTmpDir } from './audioUpload';

const CONVERT_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 30_000;

function ffmpegPath(): string {
  return process.env.FFMPEG_PATH ?? 'ffmpeg';
}

function ffprobePath(): string {
  return process.env.FFPROBE_PATH ?? 'ffprobe';
}

/** 入力音声を whisper.cpp が扱いやすい 16kHz / モノラル / PCM WAV に変換する */
export async function convertToWav16kMono(inputPath: string): Promise<string> {
  ensureAudioTmpDir();
  const outputPath = path.join(
    AUDIO_TMP_DIR,
    `audio-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.wav`,
  );

  try {
    await runProcess(
      ffmpegPath(),
      ['-y', '-v', 'error', '-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outputPath],
      { timeoutMs: CONVERT_TIMEOUT_MS },
    );
  } catch (err) {
    if (err instanceof ProcessError && err.code === 'ENOENT') {
      throw new HttpError(
        503,
        'FFMPEG_UNAVAILABLE',
        'ffmpeg が見つかりません。FFMPEG_PATH を設定してください。',
      );
    }
    const detail = err instanceof ProcessError && err.stderrTail ? ` ${err.stderrTail.trim()}` : '';
    throw new HttpError(500, 'AUDIO_CONVERT_ERROR', `音声の変換に失敗しました。${detail}`.trim());
  }

  return outputPath;
}

/** 音声の長さ（ミリ秒）を取得する。取得できない場合は undefined */
export async function probeDurationMs(filePath: string): Promise<number | undefined> {
  try {
    const { stdout } = await runProcess(
      ffprobePath(),
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { timeoutMs: PROBE_TIMEOUT_MS },
    );
    const seconds = Number.parseFloat(stdout.trim());
    return Number.isFinite(seconds) ? Math.round(seconds * 1000) : undefined;
  } catch {
    return undefined;
  }
}

/** AUDIO_MAX_DURATION_SEC を超えていれば 413 を投げる */
export function assertDurationLimit(durationMs: number | undefined): void {
  const maxSec = Number(process.env.AUDIO_MAX_DURATION_SEC ?? 3600);
  if (!Number.isFinite(maxSec) || maxSec <= 0) return;
  if (durationMs !== undefined && durationMs > maxSec * 1000) {
    const minutes = Math.round(maxSec / 60);
    throw new HttpError(
      413,
      'AUDIO_TOO_LONG',
      `音声が長すぎます(上限${minutes}分)。分割して取り込んでください。`,
    );
  }
}
