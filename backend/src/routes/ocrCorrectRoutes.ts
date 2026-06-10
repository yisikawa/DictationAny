import { Router, type Request, type Response } from 'express';
import { correctOcrWithLlm } from '../services/ollamaService';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'text is required.' } });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (payload: object) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  try {
    const correctedText = await correctOcrWithLlm(text, (current, total) => {
      send({ type: 'progress', current, total });
    });
    send({ type: 'done', correctedText });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI修正に失敗しました';
    send({ type: 'error', message });
  }

  res.end();
});

export default router;
