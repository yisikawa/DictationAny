import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../middleware/errorHandler';
import { HttpError, NotFoundError } from '../utils/httpError';

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.get('/not-found', (_req, _res) => { throw new NotFoundError('Material not found.'); });
  app.get('/teapot', (_req, _res) => { throw new HttpError(418, 'TEAPOT', 'I am a teapot.'); });
  app.get('/boom', (_req, _res) => { throw new Error('unexpected'); });
  app.post('/echo', (req, res) => { res.json({ length: JSON.stringify(req.body).length }); });
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('NotFoundError を404にマッピングする', async () => {
    const res = await request(buildApp()).get('/not-found');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toBe('Material not found.');
  });

  it('任意の HttpError をそのステータスにマッピングする', async () => {
    const res = await request(buildApp()).get('/teapot');
    expect(res.status).toBe(418);
    expect(res.body.error.code).toBe('TEAPOT');
  });

  it('ボディサイズ超過を413にマッピングする', async () => {
    const big = 'x'.repeat(6 * 1024 * 1024); // 6MB > 5MB
    const res = await request(buildApp()).post('/echo').send({ text: big });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('100KB超・5MB以下のボディは受け付ける', async () => {
    const medium = 'x'.repeat(500 * 1024); // 500KB(旧上限100KBでは失敗していたサイズ)
    const res = await request(buildApp()).post('/echo').send({ text: medium });
    expect(res.status).toBe(200);
  });

  it('未知のエラーは500にする', async () => {
    const res = await request(buildApp()).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});
