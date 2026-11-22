import 'dotenv/config';
import app from './app';
import { cleanupStaleTempFiles, ensureAudioTmpDir } from './utils/audioUpload';
import { recoverStaleJobs } from './services/transcriptionService';

const PORT = process.env.PORT ?? 3000;
const HOST = process.env.HOST ?? '0.0.0.0';

async function main() {
  // 音声取り込み用の一時ディレクトリを用意し、前回の残骸を掃除する
  // （ジョブはインメモリ管理のため、起動時点で残っているファイルはすべて孤児）
  ensureAudioTmpDir();
  const removed = await cleanupStaleTempFiles(0);
  if (removed > 0) console.log(`Removed ${removed} stale audio temp file(s).`);

  // 再起動で中断された文字起こしジョブを failed に確定させる
  const recovered = await recoverStaleJobs();
  if (recovered > 0) console.log(`Marked ${recovered} interrupted import job(s) as failed.`);

  app.listen(Number(PORT), HOST, () => {
    console.log(`Server listening on ${HOST}:${PORT} (http://localhost:${PORT})`);
  });
}

void main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
