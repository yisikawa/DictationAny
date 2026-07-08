import express from 'express';
import cors from 'cors';
import materialRoutes from './routes/materialRoutes';
import importRoutes from './routes/importRoutes';
import attemptRoutes from './routes/attemptRoutes';
import compareRoutes from './routes/compareRoutes';
import ocrCorrectRoutes from './routes/ocrCorrectRoutes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5160' }));
// PDF由来の長文教材やOCR修正の全文POSTがあるため上限を引き上げる
app.use(express.json({ limit: '5mb' }));

app.use('/api/materials', materialRoutes);
app.use('/api/imports', importRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/compare', compareRoutes);
app.use('/api/ocr-correct', ocrCorrectRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
});

app.use(errorHandler);

export default app;
