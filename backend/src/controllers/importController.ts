import type { Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import * as service from '../services/importService';
import { startAudioImport } from '../services/transcriptionService';
import { extractPdfText, pdfTextToSegments } from '../utils/pdfExtract';
import { audioUpload, cleanupTempFiles, decodeUploadFileName, getAudioMaxMb } from '../utils/audioUpload';
import prisma from '../utils/prisma';
import { validationError } from '../utils/validationError';

export { audioUpload };

export const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf');
  },
});

export async function preview(req: Request, res: Response) {
  const { sourceType, sourceUrl, language, subtitleText, subtitleFormat, title } = req.body;
  if (!sourceType) return validationError(res, 'sourceType is required.');
  if (!language) return validationError(res, 'language is required.');
  if (!subtitleText) return validationError(res, 'subtitleText is required.');

  const result = await service.previewImport({ sourceType, sourceUrl, language, subtitleText, subtitleFormat, title });
  res.json(result);
}

export async function getOne(req: Request, res: Response) {
  const id = (req.params as { importId: string }).importId;
  const job = await service.getImportJob(id);
  if (!job) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'ImportJob not found.' } });
  res.json(service.buildImportView(job));
}

export async function pdfPreview(req: Request, res: Response) {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) return validationError(res, 'PDFファイルが必要です。');

  const language = req.body.language as string;
  if (!language) return validationError(res, 'language is required.');

  const rawText = await extractPdfText(file.buffer);
  const segments = pdfTextToSegments(rawText);
  const body = segments.map(s => s.text).join(' ');
  const titleFromFile = file.originalname.replace(/\.pdf$/i, '');
  const title = (req.body.title as string | undefined) || titleFromFile || 'Imported';

  const job = await prisma.importJob.create({
    data: {
      sourceType: 'pdf',
      sourceUrl: null,
      title,
      language,
      status: 'preview',
      rawText,
      parsedJson: JSON.stringify(segments),
    },
  });

  res.json({
    importId: job.id,
    sourceType: 'pdf',
    title,
    language,
    segments,
    body,
  });
}

export async function startAudio(req: Request, res: Response) {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  const language = (req.body.language as string | undefined)?.trim();

  if (!file) {
    return validationError(
      res,
      '音声ファイルが必要です。対応形式: mp3 / m4a / aac / wav / ogg / opus / webm / flac'
      + `（上限 ${getAudioMaxMb()}MB）`,
    );
  }
  if (!language) {
    await cleanupTempFiles([file.path]);
    return validationError(res, 'language is required.');
  }

  const originalName = decodeUploadFileName(file.originalname);
  const baseName = path.basename(originalName, path.extname(originalName));
  const title = ((req.body.title as string | undefined)?.trim()) || baseName || 'Imported';

  try {
    const job = await startAudioImport({
      filePath: file.path,
      fileName: originalName,
      fileSize: file.size,
      language,
      title,
    });

    res.status(202).json({
      importId: job.id,
      status: job.status,
      progress: job.progress,
      sourceType: job.sourceType,
      title: job.title,
      language: job.language,
    });
  } catch (err) {
    // ジョブを作れなかった場合はアップロード済みファイルを残さない
    await cleanupTempFiles([file.path]);
    throw err;
  }
}

export async function saveMaterial(req: Request, res: Response) {
  const { importId, title, sourceType, sourceUrl, language, difficulty, tags, segments } = req.body;
  if (!importId || !title || !language || !segments)
    return validationError(res, 'importId, title, language, segments are required.');

  const material = await service.saveImportMaterial({ importId, title, sourceType, sourceUrl, language, difficulty, tags, segments });
  res.status(201).json(material);
}
