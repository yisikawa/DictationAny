import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import materialRoutes from './routes/materialRoutes';
import importRoutes from './routes/importRoutes';
import attemptRoutes from './routes/attemptRoutes';
import compareRoutes from './routes/compareRoutes';
import ocrCorrectRoutes from './routes/ocrCorrectRoutes';

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5160' }));
app.use(express.json());

app.use('/api/materials', materialRoutes);
app.use('/api/imports', importRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/compare', compareRoutes);
app.use('/api/ocr-correct', ocrCorrectRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
});

export default app;
