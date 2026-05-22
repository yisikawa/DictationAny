import type { Request, Response } from 'express';
import * as service from '../services/materialService';
import { validationError } from '../utils/validationError';

export async function list(req: Request, res: Response) {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));
  const result = await service.listMaterials(page, limit);
  res.json(result);
}

export async function getOne(req: Request, res: Response) {
  const m = await service.getMaterial((req.params as { materialId: string }).materialId);
  if (!m) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Material not found.' } });
  res.json(m);
}

export async function create(req: Request, res: Response) {
  const { title, body, language, difficulty, tags, sourceType, sourceUrl } = req.body;
  if (!title || typeof title !== 'string' || title.trim().length === 0 || title.length > 120)
    return validationError(res, 'title is required and must be 1-120 characters.');
  if (!body || typeof body !== 'string' || body.trim().length === 0)
    return validationError(res, 'body is required.');
  if (!language || typeof language !== 'string')
    return validationError(res, 'language is required.');

  const m = await service.createMaterial({ title, body, language, difficulty, tags, sourceType, sourceUrl });
  res.status(201).json(m);
}

export async function update(req: Request, res: Response) {
  const m = await service.getMaterial((req.params as { materialId: string }).materialId);
  if (!m) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Material not found.' } });

  const { title, body, language, difficulty, tags, sourceType, sourceUrl } = req.body;
  if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0 || title.length > 120))
    return validationError(res, 'title must be 1-120 characters.');

  const updated = await service.updateMaterial((req.params as { materialId: string }).materialId, { title, body, language, difficulty, tags, sourceType, sourceUrl });
  res.json(updated);
}

export async function remove(req: Request, res: Response) {
  const m = await service.getMaterial((req.params as { materialId: string }).materialId);
  if (!m) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Material not found.' } });
  await service.deleteMaterial((req.params as { materialId: string }).materialId);
  res.status(204).send();
}
