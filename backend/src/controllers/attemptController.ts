import type { Request, Response } from 'express';
import * as repo from '../repositories/attemptRepository';

export async function list(req: Request, res: Response) {
  const materialId = req.query.materialId as string | undefined;
  const attempts = materialId
    ? await repo.findByMaterial(materialId)
    : await repo.findAll();
  res.json(attempts);
}

export async function getOne(req: Request, res: Response) {
  const id = (req.params as { attemptId: string }).attemptId;
  const attempt = await repo.findById(id);
  if (!attempt) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Attempt not found.' } });
  res.json({ ...attempt, result: JSON.parse(attempt.resultJson) });
}

export async function create(req: Request, res: Response) {
  const { materialId, submittedText, options } = req.body;
  if (!materialId || !submittedText)
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'materialId and submittedText are required.' } });

  const attempt = await repo.create({ materialId, submittedText, options });
  res.status(201).json({ ...attempt, result: JSON.parse(attempt.resultJson) });
}
