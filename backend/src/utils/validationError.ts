import type { Response } from 'express';

export function validationError(res: Response, message: string) {
  return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } });
}
