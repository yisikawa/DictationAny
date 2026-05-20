import { Router } from 'express';
import type { Request, Response } from 'express';
import { compare } from '../services/comparisonService';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { originalText, submittedText, options } = req.body;
  if (!originalText || !submittedText)
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'originalText and submittedText are required.' } });
  const result = compare({ originalText, submittedText, options });
  res.json(result);
}));

export default router;
