import type { Request, Response } from 'express';
import multer from 'multer';
import * as service from '../services/importService';
import { extractPdfText, pdfTextToSegments } from '../utils/pdfExtract';
import prisma from '../utils/prisma';

export const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf');
  },
});

export async function preview(req: Request, res: Response) {
  const { sourceType, sourceUrl, language, subtitleText, subtitleFormat, title } = req.body;
  if (!sourceType) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'sourceType is required.' } });
  if (!language) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'language is required.' } });
  if (!subtitleText) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'subtitleText is required.' } });

  const result = await service.previewImport({ sourceType, sourceUrl, language, subtitleText, subtitleFormat, title });
  res.json(result);
}

export async function getOne(req: Request, res: Response) {
  const id = (req.params as { importId: string }).importId;
  const job = await service.getImportJob(id);
  if (!job) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'ImportJob not found.' } });
  res.json(job);
}

export async function pdfPreview(req: Request, res: Response) {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'PDFファイルが必要です。' } });

  const language = req.body.language as string;
  if (!language) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'language is required.' } });

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

export async function saveMaterial(req: Request, res: Response) {
  const { importId, title, sourceType, sourceUrl, language, difficulty, tags, segments } = req.body;
  if (!importId || !title || !language || !segments)
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'importId, title, language, segments are required.' } });

  const material = await service.saveImportMaterial({ importId, title, sourceType, sourceUrl, language, difficulty, tags, segments });
  res.status(201).json(material);
}
