import prisma from '../utils/prisma';
import type { ImportSegment } from '../types';
import { HttpError } from '../utils/httpError';
import {
  assertDurationLimit,
  convertToWav16kMono,
  probeDurationMs,
} from '../utils/audioConvert';
import {
  cleanupTempFiles,
  createTempDir,
  removeTempDir,
} from '../utils/audioUpload';
import {
  dedupeConsecutiveSegments,
  mergeSegmentsToSentences,
} from '../utils/whisperJson';
import { parseVtt, segmentsToBody } from '../utils/subtitleParser';
import {
  dedupeRollingCaptionSegments,
  isRollingCaptionVtt,
} from '../utils/rollingCaptions';
import { getSttProvider } from './stt';
import {
  downloadYoutubeAudio,
  fetchYoutubeSubtitles,
  parseYoutubeUrl,
} from './youtubeService';

/** 実行中のジョブ（インメモリ。サーバ再起動で失われるため起動時に復旧する） */
const running = new Map<string, AbortController>();
let activeCount = 0;

const PROGRESS_STEP = 5;

export interface StartAudioImportInput {
  filePath: string;
  fileName: string;
  fileSize: number;
  language: string;
  title?: string;
}

/** BCP 47（en-US）を ISO 639-1（en）に正規化する */
export function toIso6391(language: string): string {
  const primary = language.split(/[-_]/)[0]?.trim().toLowerCase();
  return primary || 'en';
}

export function isTranscriptionBusy(): boolean {
  return activeCount > 0;
}

async function updateJob(
  id: string,
  data: {
    status?: string;
    progress?: number;
    title?: string | null;
    durationMs?: number | null;
    rawText?: string;
    parsedJson?: string;
    errorMessage?: string | null;
    sttProvider?: string | null;
  },
) {
  return prisma.importJob.update({ where: { id }, data });
}

/**
 * 音声ファイルの取り込みを開始する。
 * ジョブを作成して即座に返し、文字起こしはバックグラウンドで実行する。
 */
export async function startAudioImport(input: StartAudioImportInput) {
  if (isTranscriptionBusy()) {
    throw new HttpError(
      429,
      'BUSY',
      '現在ほかの音声を処理中です。完了後に再試行してください。',
    );
  }

  // await を挟む前に予約し、同時リクエストの競合を防ぐ
  activeCount += 1;

  try {
    const provider = getSttProvider();
    const job = await prisma.importJob.create({
      data: {
        sourceType: 'audio_file',
        sourceUrl: null,
        title: input.title ?? null,
        language: input.language,
        status: 'queued',
        progress: 0,
        mediaFileName: input.fileName,
        mediaSizeBytes: input.fileSize,
        sttProvider: provider.name,
      },
    });

    const abort = new AbortController();
    running.set(job.id, abort);
    void runTranscription(job.id, input.filePath, input.language, abort);

    return job;
  } catch (err) {
    activeCount = Math.max(0, activeCount - 1);
    throw err;
  }
}

async function runTranscription(
  jobId: string,
  filePath: string,
  language: string,
  abort: AbortController,
): Promise<void> {
  let wavPath: string | undefined;
  let lastSavedProgress = 0;

  try {
    await updateJob(jobId, { status: 'processing', progress: 0 });

    const durationMs = await probeDurationMs(filePath);
    assertDurationLimit(durationMs);
    if (durationMs !== undefined) {
      await updateJob(jobId, { durationMs });
    }

    wavPath = await convertToWav16kMono(filePath);

    const result = await getSttProvider().transcribe(wavPath, {
      language: toIso6391(language),
      signal: abort.signal,
      onProgress: (percent) => {
        if (abort.signal.aborted) return;
        if (percent - lastSavedProgress < PROGRESS_STEP) return;
        lastSavedProgress = percent;
        // 進捗更新は失敗しても本処理を止めない
        void updateJob(jobId, { progress: percent }).catch(() => {});
      },
    });

    const segments = mergeSegmentsToSentences(result.segments);
    if (segments.length === 0) {
      throw new HttpError(
        422,
        'STT_NO_SPEECH',
        '音声からテキストを検出できませんでした。音声ファイルを確認してください。',
      );
    }

    await updateJob(jobId, {
      status: 'completed',
      progress: 100,
      durationMs: result.durationMs ?? durationMs ?? null,
      rawText: result.text,
      parsedJson: JSON.stringify(segments),
      errorMessage: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '文字起こしに失敗しました。';
    await updateJob(jobId, { status: 'failed', errorMessage: message }).catch(() => {});
  } finally {
    running.delete(jobId);
    activeCount = Math.max(0, activeCount - 1);
    // 元ファイルと中間 wav は成功・失敗にかかわらず必ず削除する
    await cleanupTempFiles([filePath, wavPath]);
  }
}

export interface StartYoutubeImportInput {
  sourceUrl: string;
  language: string;
  preferSubtitles: boolean;
}

function lastSegmentEndMs(segments: ImportSegment[]): number | undefined {
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const end = segments[i].endTimeMs;
    if (end !== undefined) return end;
  }
  return undefined;
}

/** YouTube URL からの取り込みを開始する（字幕優先 → 音声STTへフォールバック） */
export async function startYoutubeImport(input: StartYoutubeImportInput) {
  if (isTranscriptionBusy()) {
    throw new HttpError(
      429,
      'BUSY',
      '現在ほかの音声を処理中です。完了後に再試行してください。',
    );
  }

  activeCount += 1;

  try {
    const provider = getSttProvider();
    const job = await prisma.importJob.create({
      data: {
        sourceType: 'youtube_audio',
        sourceUrl: input.sourceUrl,
        title: null,
        language: input.language,
        status: 'queued',
        progress: 0,
        sttProvider: provider.name,
      },
    });

    const abort = new AbortController();
    running.set(job.id, abort);
    void runYoutubeImport(job.id, input, abort);

    return job;
  } catch (err) {
    activeCount = Math.max(0, activeCount - 1);
    throw err;
  }
}

async function runYoutubeImport(
  jobId: string,
  input: StartYoutubeImportInput,
  abort: AbortController,
): Promise<void> {
  let tmpDir: string | undefined;
  let wavPath: string | undefined;
  let lastSavedProgress = 0;

  try {
    const video = parseYoutubeUrl(input.sourceUrl);
    if (!video) {
      throw new HttpError(400, 'INVALID_YOUTUBE_URL', 'YouTube の URL を指定してください。');
    }

    await updateJob(jobId, { status: 'processing', progress: 5 });
    tmpDir = await createTempDir('yt');
    const language = toIso6391(input.language);

    if (input.preferSubtitles) {
      await updateJob(jobId, { progress: 10 });
      const subtitles = await fetchYoutubeSubtitles(
        input.sourceUrl,
        video.videoId,
        language,
        tmpDir,
        abort.signal,
      );
      if (subtitles.title) await updateJob(jobId, { title: subtitles.title });

      if (subtitles.vtt) {
        const cues = parseVtt(subtitles.vtt);
        const normalized = isRollingCaptionVtt(subtitles.vtt, cues)
          ? dedupeRollingCaptionSegments(cues)
          : dedupeConsecutiveSegments(cues);
        const segments = mergeSegmentsToSentences(normalized);
        if (segments.length > 0) {
          await updateJob(jobId, {
            status: 'completed',
            progress: 100,
            durationMs: lastSegmentEndMs(segments) ?? null,
            rawText: segmentsToBody(segments),
            parsedJson: JSON.stringify(segments),
            sttProvider: 'youtube-subtitles',
            errorMessage: null,
          });
          return;
        }
      }
      await updateJob(jobId, { progress: 20 });
    }

    const audio = await downloadYoutubeAudio(
      input.sourceUrl,
      video.videoId,
      tmpDir,
      abort.signal,
    );
    if (audio.title) await updateJob(jobId, { title: audio.title });
    await updateJob(jobId, { progress: 35 });

    const durationMs = await probeDurationMs(audio.filePath);
    assertDurationLimit(durationMs);
    if (durationMs !== undefined) await updateJob(jobId, { durationMs });

    wavPath = await convertToWav16kMono(audio.filePath);

    const result = await getSttProvider().transcribe(wavPath, {
      language,
      signal: abort.signal,
      onProgress: (percent) => {
        if (abort.signal.aborted) return;
        const mapped = Math.min(99, 35 + Math.round(percent * 0.6));
        if (mapped - lastSavedProgress < PROGRESS_STEP) return;
        lastSavedProgress = mapped;
        void updateJob(jobId, { progress: mapped }).catch(() => {});
      },
    });

    const segments = mergeSegmentsToSentences(result.segments);
    if (segments.length === 0) {
      throw new HttpError(
        422,
        'STT_NO_SPEECH',
        '音声からテキストを検出できませんでした。音声ファイルを確認してください。',
      );
    }

    await updateJob(jobId, {
      status: 'completed',
      progress: 100,
      durationMs: result.durationMs ?? durationMs ?? null,
      rawText: result.text,
      parsedJson: JSON.stringify(segments),
      errorMessage: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'YouTube の取り込みに失敗しました。';
    await updateJob(jobId, { status: 'failed', errorMessage: message }).catch(() => {});
  } finally {
    running.delete(jobId);
    activeCount = Math.max(0, activeCount - 1);
    await cleanupTempFiles([wavPath]);
    await removeTempDir(tmpDir);
  }
}

/** サーバ再起動時に、実行中だったジョブを failed に確定させる */
export async function recoverStaleJobs(): Promise<number> {
  const result = await prisma.importJob.updateMany({
    where: { status: { in: ['queued', 'processing'] } },
    data: {
      status: 'failed',
      errorMessage: 'サーバ再起動により処理が中断されました。再度取り込んでください。',
    },
  });
  return result.count;
}

/** 実行中のジョブを中断する（キャンセルAPI用） */
export function cancelTranscription(importId: string): boolean {
  const abort = running.get(importId);
  if (!abort) return false;
  abort.abort();
  return true;
}
