import fs from 'fs';
import path from 'path';
import { HttpError } from '../utils/httpError';
import { ProcessError, runProcess } from '../utils/processRunner';

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

const VIDEO_ID_RE = /^[\w-]{11}$/;

export interface YoutubeVideoRef {
  videoId: string;
}

/** YouTube の URL を検証し、動画 ID を取り出す（allowlist 方式） */
export function parseYoutubeUrl(value: string): YoutubeVideoRef | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  if (host === 'youtu.be') {
    const id = url.pathname.replace(/^\/+/, '').split('/')[0] ?? '';
    return VIDEO_ID_RE.test(id) ? { videoId: id } : null;
  }

  if (url.pathname === '/watch') {
    const id = url.searchParams.get('v') ?? '';
    return VIDEO_ID_RE.test(id) ? { videoId: id } : null;
  }

  const shorts = /^\/shorts\/([\w-]{11})(?:[/?]|$)/.exec(url.pathname);
  if (shorts) return { videoId: shorts[1] };

  const embed = /^\/embed\/([\w-]{11})(?:[/?]|$)/.exec(url.pathname);
  if (embed) return { videoId: embed[1] };

  return null;
}

function ytdlpPath(): string {
  return process.env.YTDLP_PATH ?? 'yt-dlp';
}

function ytdlpTimeoutMs(): number {
  const value = Number(process.env.YTDLP_TIMEOUT_MS ?? 300_000);
  return Number.isFinite(value) && value > 0 ? value : 300_000;
}

function commonArgs(): string[] {
  const args = ['--no-playlist', '--no-warnings', '--no-progress', '--retries', '2'];
  const runtime = process.env.YTDLP_JS_RUNTIME?.trim();
  if (runtime) args.push('--js-runtimes', runtime);
  return args;
}

/** 字幕取得用の yt-dlp 引数 */
export function buildSubtitleArgs(sourceUrl: string, language: string, tmpDir: string): string[] {
  const lang = language.toLowerCase();
  return [
    ...commonArgs(),
    '--no-simulate',
    '--print', '%(title)s',
    '--skip-download',
    '--write-subs',
    '--write-auto-subs',
    '--sub-langs', `${lang},${lang}-orig`,
    '--sub-format', 'vtt',
    '-o', path.join(tmpDir, '%(id)s.%(ext)s'),
    sourceUrl,
  ];
}

/** 音声取得用の yt-dlp 引数（ffmpeg が必要） */
export function buildAudioArgs(sourceUrl: string, tmpDir: string): string[] {
  return [
    ...commonArgs(),
    '--no-simulate',
    '--print', '%(title)s',
    '-x',
    '--audio-format', 'wav',
    '--audio-quality', '0',
    '-o', path.join(tmpDir, '%(id)s.%(ext)s'),
    sourceUrl,
  ];
}

/** yt-dlp のエラーから原因になりそうな1行を抜き出す */
export function summarizeYtdlpError(stderr: string): string {
  const lines = stderr
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('ERROR:'));
  const last = lines[lines.length - 1] ?? '';
  return last.replace(/^ERROR:\s*/, '');
}

async function runYtdlp(args: string[], signal?: AbortSignal): Promise<string> {
  try {
    const { stdout } = await runProcess(ytdlpPath(), args, { signal, timeoutMs: ytdlpTimeoutMs() });
    return stdout;
  } catch (err) {
    if (!(err instanceof ProcessError)) throw err;

    if (err.code === 'ENOENT') {
      throw new HttpError(
        503,
        'YTDLP_UNAVAILABLE',
        'yt-dlp が見つかりません。YTDLP_PATH を設定してください。',
      );
    }
    if (err.message.includes('中断')) {
      throw new HttpError(499, 'YTDLP_ABORTED', 'クライアントによって中断されました。');
    }
    if (err.message.includes('タイムアウト')) {
      throw new HttpError(504, 'YTDLP_TIMEOUT', '動画の取得がタイムアウトしました。');
    }

    const detail = summarizeYtdlpError(err.stderrTail ?? '');
    throw new HttpError(
      422,
      'YOUTUBE_FETCH_FAILED',
      `YouTube から取得できませんでした。${detail ? ` ${detail}` : ''}`.trim(),
    );
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findFirstFile(dir: string, pattern: RegExp): Promise<string | undefined> {
  const entries = await fs.promises.readdir(dir).catch(() => [] as string[]);
  return entries.filter(name => pattern.test(name)).sort()[0];
}

function parseTitle(stdout: string): string {
  return stdout.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? '';
}

export interface YoutubeSubtitlesResult {
  title: string;
  /** 字幕が取得できなかった場合は null（音声からの文字起こしにフォールバックする） */
  vtt: string | null;
}

/** 字幕（手動 or 自動生成）を VTT で取得する */
export async function fetchYoutubeSubtitles(
  sourceUrl: string,
  videoId: string,
  language: string,
  tmpDir: string,
  signal?: AbortSignal,
): Promise<YoutubeSubtitlesResult> {
  const stdout = await runYtdlp(buildSubtitleArgs(sourceUrl, language, tmpDir), signal);

  const title = parseTitle(stdout);
  const vttName = await findFirstFile(tmpDir, new RegExp(`^${escapeRegExp(videoId)}\\..*\\.vtt$`))
    ?? await findFirstFile(tmpDir, /\.vtt$/);

  if (!vttName) return { title, vtt: null };

  const vtt = await fs.promises.readFile(path.join(tmpDir, vttName), 'utf8');
  return { title, vtt };
}

export interface YoutubeAudioResult {
  title: string;
  filePath: string;
}

/** 音声を WAV で取得する */
export async function downloadYoutubeAudio(
  sourceUrl: string,
  videoId: string,
  tmpDir: string,
  signal?: AbortSignal,
): Promise<YoutubeAudioResult> {
  const stdout = await runYtdlp(buildAudioArgs(sourceUrl, tmpDir), signal);

  const title = parseTitle(stdout);
  const audioName = await findFirstFile(
    tmpDir,
    new RegExp(`^${escapeRegExp(videoId)}\\.(wav|mp3|m4a|webm|opus|ogg|aac)$`, 'i'),
  );

  if (!audioName) {
    throw new HttpError(422, 'YOUTUBE_NO_AUDIO', 'YouTube から音声を取得できませんでした。');
  }

  return { title, filePath: path.join(tmpDir, audioName) };
}
