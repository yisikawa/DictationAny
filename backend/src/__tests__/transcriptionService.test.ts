import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  probeDurationMs: vi.fn(),
  convertToWav16kMono: vi.fn(),
  assertDurationLimit: vi.fn(),
  cleanupTempFiles: vi.fn(),
  createTempDir: vi.fn(),
  removeTempDir: vi.fn(),
  getSttProvider: vi.fn(),
  transcribe: vi.fn(),
  parseYoutubeUrl: vi.fn(),
  fetchYoutubeSubtitles: vi.fn(),
  downloadYoutubeAudio: vi.fn(),
}));

vi.mock('../utils/prisma', () => ({
  default: {
    importJob: {
      create: mocks.create,
      update: mocks.update,
      updateMany: mocks.updateMany,
    },
  },
}));

vi.mock('../utils/audioConvert', () => ({
  probeDurationMs: mocks.probeDurationMs,
  convertToWav16kMono: mocks.convertToWav16kMono,
  assertDurationLimit: mocks.assertDurationLimit,
}));

vi.mock('../utils/audioUpload', () => ({
  cleanupTempFiles: mocks.cleanupTempFiles,
  createTempDir: mocks.createTempDir,
  removeTempDir: mocks.removeTempDir,
}));

vi.mock('../services/stt', () => ({
  getSttProvider: mocks.getSttProvider,
}));

vi.mock('../services/youtubeService', () => ({
  parseYoutubeUrl: mocks.parseYoutubeUrl,
  fetchYoutubeSubtitles: mocks.fetchYoutubeSubtitles,
  downloadYoutubeAudio: mocks.downloadYoutubeAudio,
}));

import {
  isTranscriptionBusy,
  recoverStaleJobs,
  startAudioImport,
  startYoutubeImport,
  toIso6391,
} from '../services/transcriptionService';

const input = {
  filePath: 'C:/tmp/dictationany/in.mp3',
  fileName: 'in.mp3',
  fileSize: 1234,
  language: 'en-US',
  title: 'Test Material',
};

async function waitForIdle() {
  await vi.waitFor(() => expect(isTranscriptionBusy()).toBe(false));
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'job-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  }));
  mocks.update.mockResolvedValue({});
  mocks.updateMany.mockResolvedValue({ count: 0 });
  mocks.probeDurationMs.mockResolvedValue(30_000);
  mocks.convertToWav16kMono.mockResolvedValue('C:/tmp/dictationany/out.wav');
  mocks.assertDurationLimit.mockImplementation(() => {});
  mocks.cleanupTempFiles.mockResolvedValue(undefined);
  mocks.createTempDir.mockResolvedValue('C:/tmp/dictationany/yt-job');
  mocks.removeTempDir.mockResolvedValue(undefined);

  mocks.parseYoutubeUrl.mockReturnValue({ videoId: 'jNQXAC9IVRw' });
  mocks.fetchYoutubeSubtitles.mockResolvedValue({ title: 'Sample Video', vtt: null });
  mocks.downloadYoutubeAudio.mockResolvedValue({
    title: 'Sample Video',
    filePath: 'C:/tmp/dictationany/yt-job/jNQXAC9IVRw.wav',
  });

  mocks.getSttProvider.mockReturnValue({ name: 'whisper-cpp', transcribe: mocks.transcribe });
  mocks.transcribe.mockResolvedValue({
    segments: [
      { startTimeMs: 0, endTimeMs: 1200, text: 'While I nodded,' },
      { startTimeMs: 1200, endTimeMs: 4000, text: 'nearly napping.' },
    ],
    text: 'While I nodded, nearly napping.',
    durationMs: 30_000,
  });
});

describe('toIso6391', () => {
  it('BCP 47 を ISO 639-1 に正規化する', () => {
    expect(toIso6391('en-US')).toBe('en');
    expect(toIso6391('ja_JP')).toBe('ja');
    expect(toIso6391('')).toBe('en');
  });
});

describe('startAudioImport', () => {
  it('ジョブを作成して即座に返し、完了時にセグメントと全文を保存する', async () => {
    const job = await startAudioImport(input);
    expect(job.id).toBe('job-1');
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceType: 'audio_file',
        status: 'queued',
        progress: 0,
        mediaFileName: 'in.mp3',
        sttProvider: 'whisper-cpp',
      }),
    });

    await vi.waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: expect.objectContaining({ status: 'completed', progress: 100 }),
      });
    });

    const completed = mocks.update.mock.calls
      .map(([arg]) => arg as { data: Record<string, unknown> })
      .find(arg => arg.data.status === 'completed');
    expect(completed).toBeTruthy();
    expect(JSON.parse(completed!.data.parsedJson as string)).toEqual([
      { startTimeMs: 0, endTimeMs: 4000, text: 'While I nodded, nearly napping.' },
    ]);
    expect(completed!.data.rawText).toBe('While I nodded, nearly napping.');

    expect(mocks.transcribe).toHaveBeenCalledWith(
      'C:/tmp/dictationany/out.wav',
      expect.objectContaining({ language: 'en' }),
    );
    expect(mocks.cleanupTempFiles).toHaveBeenCalledWith([
      'C:/tmp/dictationany/in.mp3',
      'C:/tmp/dictationany/out.wav',
    ]);
    await waitForIdle();
  });

  it('文字起こしが失敗したら failed と理由を保存し、一時ファイルを消す', async () => {
    mocks.transcribe.mockRejectedValue(new Error('whisper-cli が見つかりません。'));

    await startAudioImport(input);

    await vi.waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: { status: 'failed', errorMessage: 'whisper-cli が見つかりません。' },
      });
    });
    expect(mocks.cleanupTempFiles).toHaveBeenCalled();
    await waitForIdle();
  });

  it('音声からテキストが取れなかった場合は failed にする', async () => {
    mocks.transcribe.mockResolvedValue({ segments: [], text: '', durationMs: undefined });

    await startAudioImport(input);

    await vi.waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'failed', errorMessage: expect.stringContaining('検出できません') }),
      }));
    });
    await waitForIdle();
  });

  it('実行中に別の音声を取り込もうとすると 429 BUSY になる', async () => {
    let resolveTranscribe: (value: unknown) => void = () => {};
    mocks.transcribe.mockImplementation(() => new Promise((resolve) => {
      resolveTranscribe = resolve;
    }));

    await startAudioImport(input);
    await vi.waitFor(() => expect(isTranscriptionBusy()).toBe(true));

    await expect(startAudioImport(input)).rejects.toMatchObject({ status: 429, code: 'BUSY' });

    resolveTranscribe({
      segments: [{ startTimeMs: 0, endTimeMs: 1000, text: 'Done.' }],
      text: 'Done.',
    });
    await waitForIdle();
  });
});

describe('recoverStaleJobs', () => {
  it('queued / processing のジョブを failed に確定させる', async () => {
    mocks.updateMany.mockResolvedValue({ count: 2 });

    const count = await recoverStaleJobs();

    expect(count).toBe(2);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { status: { in: ['queued', 'processing'] } },
      data: {
        status: 'failed',
        errorMessage: 'サーバ再起動により処理が中断されました。再度取り込んでください。',
      },
    });
  });
});

describe('startYoutubeImport', () => {
  const ytInput = {
    sourceUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    language: 'en-US',
    preferSubtitles: true,
  };

  it('字幕が取得できたら STT を使わずに完了する', async () => {
    mocks.fetchYoutubeSubtitles.mockResolvedValue({
      title: 'Sample Video',
      vtt: [
        'WEBVTT',
        '',
        '00:00:01.000 --> 00:00:03.000',
        'Hello world.',
        '',
        '00:00:03.000 --> 00:00:05.000',
        'Hello world.',
        '',
        '00:00:05.000 --> 00:00:07.000',
        'Second sentence.',
      ].join('\n'),
    });

    await startYoutubeImport(ytInput);

    await vi.waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: expect.objectContaining({
          status: 'completed',
          progress: 100,
          sttProvider: 'youtube-subtitles',
        }),
      });
    });

    expect(mocks.transcribe).not.toHaveBeenCalled();
    expect(mocks.downloadYoutubeAudio).not.toHaveBeenCalled();

    const completed = mocks.update.mock.calls
      .map(([arg]) => arg as { data: Record<string, unknown> })
      .find(arg => arg.data.status === 'completed');
    const segments = JSON.parse(completed!.data.parsedJson as string);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({ startTimeMs: 1000, endTimeMs: 3000, text: 'Hello world.' });
    expect(completed!.data.durationMs).toBe(7000);
    expect(mocks.removeTempDir).toHaveBeenCalledWith('C:/tmp/dictationany/yt-job');
    await waitForIdle();
  });

  it('字幕が無ければ音声をダウンロードして STT にフォールバックする', async () => {
    await startYoutubeImport(ytInput);

    await vi.waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: expect.objectContaining({ status: 'completed' }),
      });
    });

    expect(mocks.downloadYoutubeAudio).toHaveBeenCalled();
    expect(mocks.transcribe).toHaveBeenCalledWith(
      'C:/tmp/dictationany/out.wav',
      expect.objectContaining({ language: 'en' }),
    );
    await waitForIdle();
  });

  it('preferSubtitles=false なら字幕取得をスキップする', async () => {
    await startYoutubeImport({ ...ytInput, preferSubtitles: false });

    await vi.waitFor(() => expect(mocks.downloadYoutubeAudio).toHaveBeenCalled());
    expect(mocks.fetchYoutubeSubtitles).not.toHaveBeenCalled();
    await waitForIdle();
  });

  it('失敗時は failed と理由を保存し、作業ディレクトリを消す', async () => {
    mocks.downloadYoutubeAudio.mockRejectedValue(
      new Error('YouTube から取得できませんでした。 Video unavailable'),
    );

    await startYoutubeImport({ ...ytInput, preferSubtitles: false });

    await vi.waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: {
          status: 'failed',
          errorMessage: 'YouTube から取得できませんでした。 Video unavailable',
        },
      });
    });
    expect(mocks.removeTempDir).toHaveBeenCalled();
    await waitForIdle();
  });
});
