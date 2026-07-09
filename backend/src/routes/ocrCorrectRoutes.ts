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

  const abort = new AbortController();
  res.on('close', () => abort.abort());

  try {
    const correctedText = await correctOcrWithLlm(
      text,
      (current, total) => { send({ type: 'progress', current, total }); },
      abort.signal,
    );
    send({ type: 'done', correctedText });
  } catch (err) {
    // クライアントが切断済みなら送信不要
    if (!abort.signal.aborted) {
      const message = err instanceof Error ? err.message : 'AI修正に失敗しました';
      send({ type: 'error', message });
    }
  }

  // 既に切断済みの接続に対して res.end() を呼んでも安全なno-op
  res.end();
});

export default router;
