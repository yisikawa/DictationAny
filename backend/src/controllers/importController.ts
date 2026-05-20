import type { Request, Response } from 'express';
import * as service from '../services/importService';

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

export async function saveMaterial(req: Request, res: Response) {
  const { importId, title, sourceType, sourceUrl, language, difficulty, tags, segments } = req.body;
  if (!importId || !title || !language || !segments)
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'importId, title, language, segments are required.' } });

  const material = await service.saveImportMaterial({ importId, title, sourceType, sourceUrl, language, difficulty, tags, segments });
  res.status(201).json(material);
}
