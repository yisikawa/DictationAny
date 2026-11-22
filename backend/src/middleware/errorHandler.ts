import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { HttpError } from '../utils/httpError';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof multer.MulterError) {
    const isSize = err.code === 'LIMIT_FILE_SIZE';
    const audioMaxMb = process.env.AUDIO_MAX_MB ?? '100';
    res.status(isSize ? 413 : 400).json({
      error: {
        code: 'UPLOAD_ERROR',
        message: isSize
          ? `ファイルサイズが上限を超えています（PDF: 20MB / 音声: ${audioMaxMb}MB）。`
          : `アップロードエラー: ${err.message}`,
      },
    });
    return;
  }
  // body-parser のサイズ超過エラー(express.json の limit 超え)
  if ((err as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'リクエストボディが大きすぎます(上限5MB)。' },
    });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
};
