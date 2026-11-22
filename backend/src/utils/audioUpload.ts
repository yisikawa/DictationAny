import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';

/** 音声ファイルの一時置き場（処理完了時に必ず削除する） */
export const AUDIO_TMP_DIR = path.join(os.tmpdir(), 'dictationany-audio');

/** 許可する MIME タイプ */
export const AUDIO_MIME = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/ogg',
  'audio/opus',
  'audio/webm',
  'audio/flac',
  'audio/x-flac',
]);

/** 許可する拡張子 */
export const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|opus|webm|flac)$/i;

export function getAudioMaxMb(): number {
  const value = Number(process.env.AUDIO_MAX_MB ?? 100);
  return Number.isFinite(value) && value > 0 ? value : 100;
}

export function getAudioMaxBytes(): number {
  return getAudioMaxMb() * 1024 * 1024;
}

/** MIME と拡張子の両方が音声として妥当か判定する
 * ブラウザやツールによっては application/octet-stream で送られることがあるため、
 * その場合は拡張子で判断する。
 */
export function isSupportedAudio(file: { mimetype: string; originalname: string }): boolean {
  const hasValidExtension = AUDIO_EXT.test(file.originalname);
  const hasAudioMime = AUDIO_MIME.has(file.mimetype) || file.mimetype === 'application/octet-stream';
  return hasValidExtension && hasAudioMime;
}

export function ensureAudioTmpDir(): void {
  fs.mkdirSync(AUDIO_TMP_DIR, { recursive: true });
}

/** multer/busboy が latin1 で復号した日本語ファイル名を UTF-8 に戻す */
export function decodeUploadFileName(name: string): string {
  // すでに非 ASCII の Unicode 文字を含む場合は復号済みとみなす
  if (/[^\u0000-\u00FF]/.test(name)) return name;
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    return decoded.includes('\uFFFD') ? name : decoded;
  } catch {
    return name;
  }
}

/** 処理ごとの作業ディレクトリを作る（yt-dlp など複数ファイルを吐く処理用） */
export async function createTempDir(prefix: string): Promise<string> {
  ensureAudioTmpDir();
  const dir = path.join(
    AUDIO_TMP_DIR,
    `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
  );
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

/** 作業ディレクトリごと削除する */
export async function removeTempDir(dir: string | undefined | null): Promise<void> {
  if (!dir) return;
  try {
    await fs.promises.rm(dir, { recursive: true, force: true });
  } catch {
    // 既に削除済みなどは無視する
  }
}

/** 指定ファイルを削除する（存在しない場合や失敗は無視） */
export async function cleanupTempFiles(paths: (string | undefined | null)[]): Promise<void> {
  await Promise.all(
    paths.filter((p): p is string => Boolean(p)).map(async (p) => {
      try {
        await fs.promises.unlink(p);
      } catch {
        // 既に削除済み・使用中などは無視する
      }
    }),
  );
}

/** 起動時に残っている古い一時ファイルを掃除する */
export async function cleanupStaleTempFiles(maxAgeMs = 24 * 60 * 60 * 1000): Promise<number> {
  ensureAudioTmpDir();
  const now = Date.now();
  let removed = 0;
  const entries = await fs.promises.readdir(AUDIO_TMP_DIR).catch(() => [] as string[]);
  await Promise.all(entries.map(async (name) => {
    const full = path.join(AUDIO_TMP_DIR, name);
    try {
      const stat = await fs.promises.stat(full);
      if (now - stat.mtimeMs > maxAgeMs) {
        await fs.promises.unlink(full);
        removed += 1;
      }
    } catch {
      // 削除できなくても致命的ではない
    }
  }));
  return removed;
}

export const audioUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureAudioTmpDir();
      cb(null, AUDIO_TMP_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: getAudioMaxBytes(), files: 1 },
  fileFilter: (_req, file, cb) => cb(null, isSupportedAudio(file)),
});
