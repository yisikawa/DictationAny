import { Router } from 'express';
import type { Request, Response } from 'express';
import { compare } from '../services/comparisonService';
import { asyncHandler } from '../utils/asyncHandler';
import { validationError } from '../utils/validationError';

const router = Router();

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { originalText, submittedText, options } = req.body;
  if (!originalText || !submittedText)
    return validationError(res, 'originalText and submittedText are required.');
  const result = compare({ originalText, submittedText, options });
  res.json(result);
}));

export default router;
