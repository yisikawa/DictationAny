# コードレビュー指摘事項 修正計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2026-07-08のコードレビューで指摘された不具合(長文でのサーバクラッシュ・リクエストサイズ上限・英文成型の誤修正・エラーハンドリング等)を修正する。

**Architecture:** バックエンド(Express 5 + Prisma 7 + SQLite)とフロントエンド(React 19 + Vite 8)のモノレポ。バックエンドはHTTPエラークラスと共通エラーハンドラを導入し、ドメインエラーを適切なステータスコードにマッピングする。アルゴリズム系の修正(Levenshtein・英文成型)はTDDで進める。

**Tech Stack:** TypeScript, Express 5, Prisma 7 (better-sqlite3 adapter), Vitest 4, React 19, Vite 8, compromise (NLP)

## Global Constraints

- Node.js >= 22.0.0(`backend/package.json` / `frontend/package.json` の engines に準拠)
- backend は `"type": "commonjs"`、frontend は `"type": "module"`
- UIの文言・エラーメッセージは日本語(既存コードの慣例に従う)
- コミットメッセージは既存履歴の形式に従う: `fix: <日本語の説明>` / `feat: <日本語の説明>` / `refactor: <日本語の説明>`
- テストコマンド: backend は `cd backend && npm test`(vitest)、frontend は Task 5 で vitest を導入
- 既存テスト(`backend/src/__tests__/comparisonService.test.ts`, `subtitleParser.test.ts`)を壊さないこと
- `backend/src/generated/prisma/` は自動生成物。手で編集しない

## 対象外(今回は修正しない)

以下はレビューで挙がったが、仕様判断が必要またはリスクに対して効果が小さいため今回のスコープ外とする:

- `cleanOcrText` のフロント/バックエンド重複統合(パッケージ間共有の仕組みが必要)
- `fixDuplicateWords` の正当な連続語("had had" 等)の例外リスト
- `isAllCapsHeading` 適用前のプレビュー表示
- TTS再生中の速度変更の即時反映

---

### Task 1: Levenshtein距離のローリングDP化と文字数上限

長文教材(PDF取り込み)で採点すると `levenshtein` がフルDP行列(O(m×n)メモリ)を確保し、Nodeプロセスがフリーズ/OOMする。2行のみ保持するローリングDPに変更し、CPU保護のため入力文字数に上限(10,000文字)を設ける。上限適用時は `comparisonService` の文字一致率の分母も切り詰め後の長さに合わせる。

**Files:**
- Modify: `backend/src/utils/diffText.ts`
- Modify: `backend/src/services/comparisonService.ts`
- Create: `backend/src/__tests__/diffText.test.ts`

**Interfaces:**
- Produces: `levenshtein(a: string, b: string): number`(シグネチャ不変)、`LEVENSHTEIN_MAX_CHARS = 10_000`(diffText.ts からexport、comparisonService が使用)

- [ ] **Step 1: 失敗するテストを書く**

`backend/src/__tests__/diffText.test.ts` を作成:

```typescript
import { describe, it, expect } from 'vitest';
import { levenshtein, LEVENSHTEIN_MAX_CHARS, diffWords } from '../utils/diffText';

describe('levenshtein', () => {
  it('基本的な編集距離を返す', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('空文字列を扱える', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('', '')).toBe(0);
  });

  it('上限文字数の定数をエクスポートしている', () => {
    expect(LEVENSHTEIN_MAX_CHARS).toBe(10_000);
  });

  it('長大な入力でもクラッシュせず妥当な時間で完了する', () => {
    const a = 'abcdefghij'.repeat(5_000); // 50,000文字
    const b = 'abcdefghix'.repeat(5_000); // 50,000文字
    const start = Date.now();
    const dist = levenshtein(a, b);
    expect(Date.now() - start).toBeLessThan(5_000);
    // 上限で切り詰められるため、距離は上限以下
    expect(dist).toBeLessThanOrEqual(LEVENSHTEIN_MAX_CHARS);
    expect(dist).toBeGreaterThan(0);
  });
});

describe('diffWords', () => {
  it('既存の挙動を維持する(equal/missing/extra/replace)', () => {
    const result = diffWords(['the', 'quick', 'fox'], ['the', 'slow', 'fox']);
    expect(result).toEqual([
      { type: 'equal', text: 'the' },
      { type: 'replace', expected: 'quick', actual: 'slow' },
      { type: 'equal', text: 'fox' },
    ]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && npx vitest run src/__tests__/diffText.test.ts`
Expected: FAIL — `LEVENSHTEIN_MAX_CHARS` が未定義でインポートエラー、または長大入力テストがタイムアウト/OOM

- [ ] **Step 3: 実装**

`backend/src/utils/diffText.ts` の `levenshtein` を以下に置き換える(`diffWords` は変更しない):

```typescript
import type { DiffToken } from '../types';

// これ以上長い文字列は切り詰めて比較する(メモリ・CPU保護)
export const LEVENSHTEIN_MAX_CHARS = 10_000;

export function levenshtein(a: string, b: string): number {
  const s = a.length > LEVENSHTEIN_MAX_CHARS ? a.slice(0, LEVENSHTEIN_MAX_CHARS) : a;
  const t = b.length > LEVENSHTEIN_MAX_CHARS ? b.slice(0, LEVENSHTEIN_MAX_CHARS) : b;
  const m = s.length, n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // 2行のみ保持するローリングDP(メモリ O(n))
  let prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  let curr: number[] = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = s[i - 1] === t[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}
```

- [ ] **Step 4: comparisonService の分母を上限に合わせる**

`backend/src/services/comparisonService.ts` のインポートと `charAccuracy` 計算を変更:

```typescript
import { diffWords, levenshtein, LEVENSHTEIN_MAX_CHARS } from '../utils/diffText';
```

```typescript
  const dist = levenshtein(normOrig, normSub);
  const cappedOrigLen = Math.min(normOrig.length, LEVENSHTEIN_MAX_CHARS);
  const charAccuracy = cappedOrigLen === 0 ? 100
    : Math.round(Math.max(0, 1 - dist / cappedOrigLen) * 100);
```

- [ ] **Step 5: 全テストがパスすることを確認**

Run: `cd backend && npm test`
Expected: PASS(diffText.test.ts、既存の comparisonService.test.ts / subtitleParser.test.ts すべて)

- [ ] **Step 6: コミット**

```bash
git add backend/src/utils/diffText.ts backend/src/services/comparisonService.ts backend/src/__tests__/diffText.test.ts
git commit -m "fix: Levenshtein距離をローリングDP化し長文でのメモリ枯渇を防止"
```

---

### Task 2: HTTPエラー基盤とJSONボディ上限の引き上げ

現状、存在しない教材への提出(`Material not found`)やインポートジョブ未存在、multerのサイズ超過、100KBを超えるJSONボディがすべて汎用500「An unexpected error occurred」になる。専用エラークラスと共通エラーハンドラを導入し、`express.json` の上限を5MBに引き上げる。

**Files:**
- Create: `backend/src/utils/httpError.ts`
- Create: `backend/src/middleware/errorHandler.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/repositories/attemptRepository.ts:28`
- Modify: `backend/src/services/importService.ts:40`
- Test: `backend/src/__tests__/errorHandler.test.ts`

**Interfaces:**
- Produces: `HttpError(status, code, message)` / `NotFoundError(message)`(utils/httpError.ts)、`errorHandler: ErrorRequestHandler`(middleware/errorHandler.ts)。以降のタスクでドメインエラーを投げる場合はこれらを使う。

- [ ] **Step 1: supertest をインストール**

```bash
cd backend && npm install --save-dev supertest @types/supertest
```

- [ ] **Step 2: 失敗するテストを書く**

`backend/src/__tests__/errorHandler.test.ts` を作成:

```typescript
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
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `cd backend && npx vitest run src/__tests__/errorHandler.test.ts`
Expected: FAIL — `../middleware/errorHandler` と `../utils/httpError` が存在しない

- [ ] **Step 4: エラークラスを実装**

`backend/src/utils/httpError.ts` を作成:

```typescript
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, 'NOT_FOUND', message);
  }
}
```

- [ ] **Step 5: エラーハンドラを実装**

`backend/src/middleware/errorHandler.ts` を作成:

```typescript
import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { HttpError } from '../utils/httpError';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof multer.MulterError) {
    const isSize = err.code === 'LIMIT_FILE_SIZE';
    res.status(isSize ? 413 : 400).json({
      error: {
        code: 'UPLOAD_ERROR',
        message: isSize ? 'ファイルサイズが上限(20MB)を超えています。' : `アップロードエラー: ${err.message}`,
      },
    });
    return;
  }
  // body-parser のサイズ超過エラー(express.json の limit 超え)
  if ((err as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'リクエストボディが大きすぎます(上限5MB)。' },
    });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
};
```

- [ ] **Step 6: app.ts を書き換える**

`backend/src/app.ts` 全体を以下に置き換える:

```typescript
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
```

- [ ] **Step 7: ドメインエラーを NotFoundError に置き換える**

`backend/src/repositories/attemptRepository.ts` — インポートを追加し、`create` 内の throw を変更:

```typescript
import { NotFoundError } from '../utils/httpError';
```

```typescript
  const material = await prisma.material.findUnique({ where: { id: input.materialId } });
  if (!material) throw new NotFoundError('教材が見つかりません。削除された可能性があります。');
```

`backend/src/services/importService.ts` — 同様に:

```typescript
import { NotFoundError } from '../utils/httpError';
```

```typescript
  const job = await prisma.importJob.findUnique({ where: { id: input.importId } });
  if (!job) throw new NotFoundError('インポートジョブが見つかりません。');
```

- [ ] **Step 8: 全テストと型チェックがパスすることを確認**

Run: `cd backend && npm test && npx tsc --noEmit`
Expected: すべてPASS、型エラーなし

- [ ] **Step 9: コミット**

```bash
git add backend/src/utils/httpError.ts backend/src/middleware/errorHandler.ts backend/src/app.ts backend/src/repositories/attemptRepository.ts backend/src/services/importService.ts backend/src/__tests__/errorHandler.test.ts backend/package.json backend/package-lock.json
git commit -m "fix: HTTPエラー基盤を導入しドメインエラーを404/413に正しくマッピング、JSONボディ上限を5MBに拡大"
```

---

### Task 3: AI修正(SSE)のクライアント切断時にOllama処理を中断

`/api/ocr-correct` はSSEで進捗を返すが、ユーザーがページを離れてもOllamaへのチャンク逐次リクエスト(1チャンク最大120秒×N)が最後まで走り続ける。接続クローズで `AbortController` を発火させ、処理を打ち切る。

**Files:**
- Modify: `backend/src/services/ollamaService.ts`
- Modify: `backend/src/routes/ocrCorrectRoutes.ts`
- Test: `backend/src/__tests__/ollamaService.test.ts`

**Interfaces:**
- Produces: `correctOcrWithLlm(text: string, onProgress?: (current: number, total: number) => void, signal?: AbortSignal): Promise<string>`(第3引数 `signal` を追加。既存呼び出しは互換)

- [ ] **Step 1: 失敗するテストを書く**

`backend/src/__tests__/ollamaService.test.ts` を作成:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { correctOcrWithLlm } from '../services/ollamaService';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchEcho() {
  return vi.fn(async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}') as { messages: { content: string }[] };
    const userContent = body.messages[1].content;
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: userContent } }] }),
    } as unknown as Response;
  });
}

describe('correctOcrWithLlm', () => {
  it('中断済みシグナルを渡すとOllamaを呼ばずにエラーになる', async () => {
    const fetchMock = mockFetchEcho();
    vi.stubGlobal('fetch', fetchMock);

    const abort = new AbortController();
    abort.abort();

    await expect(correctOcrWithLlm('hello world', undefined, abort.signal))
      .rejects.toThrow('中断');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('シグナルなしなら従来どおり動作する', async () => {
    const fetchMock = mockFetchEcho();
    vi.stubGlobal('fetch', fetchMock);

    const result = await correctOcrWithLlm('hello world this is a test sentence.');
    expect(result).toBe('hello world this is a test sentence.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && npx vitest run src/__tests__/ollamaService.test.ts`
Expected: FAIL — 「中断済みシグナル」のテストが失敗(現状は signal 引数を無視して fetch が呼ばれる)

- [ ] **Step 3: ollamaService に signal を実装**

`backend/src/services/ollamaService.ts` の `correctChunk` のシグネチャと `signal` 指定を変更:

```typescript
async function correctChunk(
  baseUrl: string,
  model: string,
  chunk: string,
  signal?: AbortSignal,
): Promise<string> {
```

`fetch` 呼び出しの `signal` オプションを変更:

```typescript
      signal: signal
        ? AbortSignal.any([AbortSignal.timeout(120_000), signal])
        : AbortSignal.timeout(120_000),
```

`correctOcrWithLlm` を変更:

```typescript
export async function correctOcrWithLlm(
  text: string,
  onProgress?: (current: number, total: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';
  const model = process.env.OLLAMA_MODEL ?? 'llama3.1:latest';

  const chunks = splitIntoChunks(text);
  const total = chunks.length;

  // 並列だとモデルに負荷がかかるため順番に処理
  const results: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw new Error('クライアントによって中断されました。');
    results.push(await correctChunk(baseUrl, model, chunks[i], signal));
    onProgress?.(i + 1, total);
  }

  return results.join('\n\n');
}
```

あわせて `correctChunk` 内の catch 節にabort由来の分岐を追加(`msg.includes('TimeoutError')` の判定より前に置く):

```typescript
    if (signal?.aborted || msg.includes('AbortError') || msg.includes('aborted')) {
      throw new Error('クライアントによって中断されました。');
    }
```

- [ ] **Step 4: ルートで切断を検知する**

`backend/src/routes/ocrCorrectRoutes.ts` の `try` ブロック前後を変更:

```typescript
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

  res.end();
```

- [ ] **Step 5: 全テストがパスすることを確認**

Run: `cd backend && npm test && npx tsc --noEmit`
Expected: すべてPASS

- [ ] **Step 6: コミット**

```bash
git add backend/src/services/ollamaService.ts backend/src/routes/ocrCorrectRoutes.ts backend/src/__tests__/ollamaService.test.ts
git commit -m "fix: AI修正のSSE接続切断時にOllamaへのリクエストを中断するように修正"
```

---

### Task 4: 練習履歴一覧の軽量化と教材タイトル表示

`GET /api/attempts` が全attemptの `resultJson`(巨大なdiff配列を含む)と `submittedText` を返しており、履歴画面はスコア数値しか使わない。一覧用のselectを導入してペイロードを削減し、あわせて教材タイトルを含めて履歴画面に表示する。

**Files:**
- Modify: `backend/src/repositories/attemptRepository.ts`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/features/attempts/api.ts`
- Modify: `frontend/src/pages/HistoryPage.tsx`

**Interfaces:**
- Consumes: なし(Task 2 の変更済み attemptRepository をベースに編集)
- Produces: `GET /api/attempts` のレスポンス形が `{ id, materialId, score, wordAccuracy, characterAccuracy, createdAt, material: { title } }[]` に変わる。フロントの型 `AttemptListItem` を `frontend/src/types/index.ts` に追加。`attemptsApi.list` の戻り値は `AttemptListItem[]`。詳細取得 `GET /api/attempts/:id` は従来どおり全フィールド。

- [ ] **Step 1: リポジトリに一覧用selectを導入**

`backend/src/repositories/attemptRepository.ts` の `findByMaterial` と `findAll` を変更(`findById` / `create` / `toAttemptResponse` は変更しない):

```typescript
// 一覧では巨大な resultJson / submittedText を返さない
const listSelect = {
  id: true,
  materialId: true,
  score: true,
  wordAccuracy: true,
  characterAccuracy: true,
  createdAt: true,
  material: { select: { title: true } },
} as const;

export async function findByMaterial(materialId: string) {
  return prisma.attempt.findMany({
    where: { materialId },
    orderBy: { createdAt: 'desc' },
    select: listSelect,
  });
}

export async function findAll() {
  return prisma.attempt.findMany({ orderBy: { createdAt: 'desc' }, select: listSelect });
}
```

- [ ] **Step 2: フロントの型を追加**

`frontend/src/types/index.ts` の `Attempt` インターフェースの直後に追加:

```typescript
export interface AttemptListItem {
  id: string;
  materialId: string;
  score: number;
  wordAccuracy: number;
  characterAccuracy: number;
  createdAt: string;
  material: { title: string };
}
```

- [ ] **Step 3: attemptsApi.list の型を変更**

`frontend/src/features/attempts/api.ts` を以下に置き換える:

```typescript
import { api } from '../../services/api';
import type { Attempt, AttemptListItem, CompareOptions, CompareResult } from '../../types';

export interface AttemptDetail extends Attempt {
  result: CompareResult;
}

export const attemptsApi = {
  list: (materialId?: string) =>
    api.get<AttemptListItem[]>(materialId ? `/attempts?materialId=${materialId}` : '/attempts'),
  get: (id: string) => api.get<AttemptDetail>(`/attempts/${id}`),
  create: (materialId: string, submittedText: string, options?: CompareOptions) =>
    api.post<AttemptDetail>('/attempts', { materialId, submittedText, options }),
};
```

- [ ] **Step 4: 履歴画面に教材タイトル列を追加**

`frontend/src/pages/HistoryPage.tsx` — 型インポートを `Attempt` から `AttemptListItem` に変更:

```typescript
import type { AttemptListItem } from '../types';
```

```typescript
  const { data: attempts, loading, error } = useAsyncResource<AttemptListItem[]>(
    () => attemptsApi.list(),
    [],
  );
```

テーブルヘッダに教材列を追加(「日時」の直後):

```tsx
            <tr>
              <th>日時</th>
              <th>教材</th>
              <th>スコア</th>
              <th>単語一致率</th>
              <th>文字一致率</th>
              <th></th>
            </tr>
```

行にもタイトルセルを追加(日時セルの直後):

```tsx
                <td className={styles.date}>{new Date(a.createdAt).toLocaleString('ja-JP')}</td>
                <td>{a.material.title}</td>
```

- [ ] **Step 5: 型チェックとビルドで検証**

Run: `cd backend && npx tsc --noEmit`
Expected: 型エラーなし

Run: `cd frontend && npm run build`
Expected: ビルド成功

- [ ] **Step 6: 動作確認(手動)**

バックエンド起動(`cd backend && npm run dev`)後:

```bash
curl -s http://localhost:3000/api/attempts | head -c 500
```

Expected: 各要素に `resultJson` / `submittedText` が含まれず、`material: { title: ... }` が含まれる(attemptが0件なら `[]`)

- [ ] **Step 7: コミット**

```bash
git add backend/src/repositories/attemptRepository.ts frontend/src/types/index.ts frontend/src/features/attempts/api.ts frontend/src/pages/HistoryPage.tsx
git commit -m "fix: 練習履歴一覧からresultJsonを除外して軽量化し、教材タイトルを表示"
```

---

### Task 5: 英文成型の略語・URL破壊を修正(frontend vitest導入含む)

「英文成型」ボタンの `formatEnglishText` に2つの問題がある:
1. `/([.!?])([A-Za-z])/` → `'$1 $2'` が `U.S.` → `U. S.`、`e.g.` → `e. g.`、`example.com` → `example. com` と略語・URLまで分割する
2. `\bL\b` → `I` が `50 L`(リットル)などの正当な `L` まで置換する

文境界の判定を「小文字2文字+終端記号の直後に大文字」に絞り、`L`→`I` は後続が代表的な動詞の場合に限定する。フロントにはテストランナーがないため、まず vitest を導入する。

**Files:**
- Modify: `frontend/package.json`(vitest追加)
- Modify: `frontend/src/utils/formatEnglishText.ts`
- Create: `frontend/src/utils/__tests__/formatEnglishText.test.ts`

**Interfaces:**
- Produces: `formatEnglishText(text: string): string` / `countFormattingIssues(text: string): number`(シグネチャ不変、挙動のみ修正)

- [ ] **Step 1: vitest を導入**

```bash
cd frontend && npm install --save-dev vitest
```

`frontend/package.json` の `scripts` に追加:

```json
    "test": "vitest run",
```

- [ ] **Step 2: 失敗するテストを書く**

`frontend/src/utils/__tests__/formatEnglishText.test.ts` を作成:

```typescript
import { describe, it, expect } from 'vitest';
import { formatEnglishText, countFormattingIssues } from '../formatEnglishText';

describe('formatEnglishText', () => {
  it('文の間のスペース欠落を補完する', () => {
    expect(formatEnglishText('It was late.We went home.')).toContain('late. We');
  });

  it('略語を分割しない', () => {
    expect(formatEnglishText('The U.S. is large.')).toContain('U.S.');
    expect(formatEnglishText('See the report, e.g. page 3.')).toContain('e.g.');
  });

  it('URLを分割しない', () => {
    expect(formatEnglishText('Visit example.com for details.')).toContain('example.com');
  });

  it('単独の大文字Lを無条件にIへ置換しない', () => {
    expect(formatEnglishText('Add 50 L of water.')).toContain('50 L');
  });

  it('動詞が続く場合はOCR誤認識のLをIに直す', () => {
    expect(formatEnglishText('L am happy.')).toContain('I am happy');
    expect(formatEnglishText("L'm happy.")).toContain("I'm happy");
    expect(formatEnglishText('Lt was cold.')).toContain('It was cold');
  });

  it('リガチャを展開する', () => {
    expect(formatEnglishText('We ﬁnd a ﬂower.')).toContain('find a flower');
  });
});

describe('countFormattingIssues', () => {
  it('略語を修正件数に数えない', () => {
    expect(countFormattingIssues('The U.S. is large. We agree.')).toBe(0);
  });

  it('文間スペース欠落を数える', () => {
    expect(countFormattingIssues('It was late.We went home.')).toBe(1);
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `cd frontend && npx vitest run src/utils/__tests__/formatEnglishText.test.ts`
Expected: FAIL — 「略語を分割しない」「URLを分割しない」「単独の大文字L」のテストが失敗

- [ ] **Step 4: 実装を修正**

`frontend/src/utils/formatEnglishText.ts` を以下に置き換える:

```typescript
import nlp from 'compromise'

const OCR_FIXES: Array<[RegExp, string]> = [
  // Unicode ligatures from PDF/OCR scanning
  [/ﬁ/g, 'fi'],
  [/ﬂ/g, 'fl'],
  [/ﬀ/g, 'ff'],
  [/ﬃ/g, 'ffi'],
  [/ﬄ/g, 'ffl'],
  // Curly/smart quotes → straight ASCII
  [/['']/g, "'"],
  [/[""]/g, '"'],
  // Digit-letter confusion in numeric context (e.g. "2l3" → "213", "2O3" → "203")
  [/(\d)l(\d)/g, '$11$2'],
  [/(\d)O(\d)/g, '$10$2'],
  // Capital I mistaken as L by OCR — 誤爆を避けるため文脈を限定する
  [/\bLt\b/g, 'It'],
  [/\bL(?='[a-z])/g, 'I'],
  [/\bL\b(?=\s+(?:am|was|will|would|have|had|can|could|do|did|don't|didn't|think|know|want|went|got)\b)/g, 'I'],
]

// 文間スペース補完: 「小文字2文字+終端記号」の直後に大文字が続く場合のみ。
// U.S. / e.g. / example.com のような略語・URLには反応しない。
const SENTENCE_GAP_RE = /([a-z]{2}[.!?])(?=[A-Z])/g

export function formatEnglishText(text: string): string {
  // Split on paragraph breaks, preserving the separators
  const segments = text.split(/(\n{2,})/)

  return segments
    .map(segment => {
      if (/^\n+$/.test(segment)) return segment

      let result = segment

      for (const [pat, rep] of OCR_FIXES) {
        result = result.replace(pat, rep)
      }

      result = result
        .replace(/\s+([,;:!?.])/g, '$1')
        .replace(SENTENCE_GAP_RE, '$1 ')
        .replace(/[ \t]{2,}/g, ' ')

      // Capitalize first word of each sentence using NLP sentence boundary detection
      const doc = nlp(result)
      doc.sentences().forEach(s => {
        s.terms().first().toTitleCase()
      })

      return doc.text()
    })
    .join('')
}

export function countFormattingIssues(text: string): number {
  let count = 0

  for (const [pat] of OCR_FIXES) {
    count += (text.match(pat) ?? []).length
  }

  // Spacing issues fixed by formatEnglishText
  count += (text.match(/\s+[,;:!?.]/g) ?? []).length
  count += (text.match(/[a-z]{2}[.!?](?=[A-Z])/g) ?? []).length
  count += (text.match(/[ \t]{2,}/g) ?? []).length

  const doc = nlp(text)
  doc.sentences().forEach(s => {
    const t = s.text().trimStart()
    if (/^[a-z]/.test(t)) count++
  })

  return count
}
```

注意: compromise の `doc.text()` が空白や記号を正規化する場合があるため、テストの期待値は `toContain` による部分一致にしてある。もしテストが compromise の出力差異で失敗した場合は、期待値の文字列を実際の出力に合わせて調整してよい(略語・URLが分割されていないことの検証が本質)。

- [ ] **Step 5: テストがパスすることを確認**

Run: `cd frontend && npx vitest run src/utils/__tests__/formatEnglishText.test.ts`
Expected: PASS

- [ ] **Step 6: ビルド確認とコミット**

Run: `cd frontend && npm run build`
Expected: ビルド成功

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/utils/formatEnglishText.ts frontend/src/utils/__tests__/formatEnglishText.test.ts
git commit -m "fix: 英文成型が略語・URL・単独のLを誤って変換する問題を修正(vitest導入)"
```

---

### Task 6: 環境依存のハードコード値を設定に外出し

LAN IP `192.168.111.10` が `vite.config.ts`(devサーバhost・mkcert証明書ホスト)と `server.ts` の起動ログに直書きされており、他のマシンではdevサーバが起動しない。また `PracticePage` のトラブルシュート文言に個人のマイク機種名「Logi C270」が埋め込まれている。CORSのデフォルトオリジンも実際のdevサーバ(https)と食い違っている。

**Files:**
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/.env.example`
- Create: `frontend/.env.local`(gitignore対象。現在の動作を維持するための開発者ローカル設定)
- Modify: `backend/src/server.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/.env.example`
- Modify: `frontend/src/pages/PracticePage.tsx:110`

**Interfaces:**
- Consumes: Task 2 変更後の `backend/src/app.ts`
- Produces: 環境変数 `VITE_DEV_HOST`(devサーバのバインドホスト、省略時 `localhost`)。`CORS_ORIGIN` はカンマ区切りで複数指定可能になる。

- [ ] **Step 1: vite.config.ts を環境変数対応にする**

`frontend/vite.config.ts` を以下に置き換える:

```typescript
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // LANアクセスする場合は .env.local に VITE_DEV_HOST=<LAN IP> を設定する
  const devHost = env.VITE_DEV_HOST || 'localhost'

  return {
    plugins: [
      react(),
      mkcert({
        hosts: devHost === 'localhost' ? ['localhost'] : ['localhost', devHost],
      }),
    ],
    server: {
      https: {},
      host: devHost,
      port: 5160,
      proxy: {
        '/api': 'http://localhost:3000',
      },
    },
  }
})
```

- [ ] **Step 2: env のサンプルとローカル設定を用意**

`frontend/.env.example` を以下に置き換える:

```bash
# APIのベースURL。デプロイ時やリバースプロキシ構成時に変更する
# VITE_API_BASE_URL="/api"

# devサーバのバインドホスト。LANの他端末からアクセスする場合にLAN IPを設定する
# VITE_DEV_HOST="192.168.111.10"
```

`frontend/.env.local` を作成(`.gitignore` の `*.local` により追跡されない。現行のLANアクセス動作を維持するため。既にファイルが存在する場合は以下の行を追記する):

```bash
VITE_DEV_HOST="192.168.111.10"
```

- [ ] **Step 3: server.ts の起動ログを修正**

`backend/src/server.ts` を以下に置き換える:

```typescript
import 'dotenv/config';
import app from './app';

const PORT = process.env.PORT ?? 3000;
const HOST = process.env.HOST ?? '0.0.0.0';

app.listen(Number(PORT), HOST, () => {
  console.log(`Server listening on ${HOST}:${PORT} (http://localhost:${PORT})`);
});
```

- [ ] **Step 4: CORSを複数オリジン対応にしデフォルトをhttpsに揃える**

`backend/src/app.ts` のCORS設定行を以下に置き換える:

```typescript
// devサーバはhttps(mkcert)。複数オリジンはカンマ区切りで指定する
const corsOrigins = (process.env.CORS_ORIGIN ?? 'https://localhost:5160')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
app.use(cors({ origin: corsOrigins }));
```

`backend/.env.example` のCORS行を以下に置き換える:

```bash
# フロントエンドのオリジン。カンマ区切りで複数指定可。LANアクセスする場合はLAN IPのオリジンを追加
CORS_ORIGIN="https://localhost:5160,https://192.168.111.10:5160"
```

- [ ] **Step 5: PracticePage の機種名を汎用化**

`frontend/src/pages/PracticePage.tsx` の110行目付近:

変更前:

```tsx
                <li>「マイク (Logi C270)」を右クリック →<strong>「既定の通信デバイスとして設定」</strong></li>
```

変更後:

```tsx
                <li>使用するマイクを右クリック →<strong>「既定の通信デバイスとして設定」</strong></li>
```

- [ ] **Step 6: 検証**

Run: `cd frontend && npm run build`
Expected: ビルド成功

Run: `cd backend && npx tsc --noEmit`
Expected: 型エラーなし

Run: `cd frontend && npm run dev`(起動確認後 Ctrl+C で停止)
Expected: `.env.local` があるため従来どおり `https://192.168.111.10:5160/` で起動する

- [ ] **Step 7: コミット**

```bash
git add frontend/vite.config.ts frontend/.env.example backend/src/server.ts backend/src/app.ts backend/.env.example frontend/src/pages/PracticePage.tsx
git commit -m "refactor: LAN IPとマイク機種名のハードコードを環境変数・汎用文言に外出し"
```

---

### Task 7: 小規模クリーンアップ(APIクライアント・materialService・.env.example)

3件の小さな修正: (1) バックエンド停止時などにプロキシがHTMLエラーページを返すと、フロントの `JSON.parse` が例外を投げてユーザーに「Unexpected token」が見える。(2) `materialService.updateMaterial` に誤ったコメントと冗長な取得がある(存在チェックはコントローラで実施済み)。(3) `.env.example` の `DATABASE_URL` は Prisma CLI(マイグレーション)専用で、アプリ実行時は `prisma.ts` がパスを直接解決していることが読み取れない。

**Files:**
- Modify: `frontend/src/services/api.ts`
- Modify: `backend/src/services/materialService.ts:30-34`
- Modify: `backend/.env.example:1`

**Interfaces:**
- Consumes: なし
- Produces: 変更なし(既存シグネチャ維持)

- [ ] **Step 1: parseJsonSafe を非JSONレスポンス耐性にする**

`frontend/src/services/api.ts` を以下に置き換える:

```typescript
const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

async function parseJsonSafe(res: Response) {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  // プロキシやサーバ停止時はHTML等の非JSONが返ることがある
  try { return JSON.parse(text); } catch { return null; }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const json = await parseJsonSafe(res);
  if (!res.ok) throw new Error(json?.error?.message ?? `リクエストに失敗しました (${res.status})`);
  return json as T;
}

async function requestFile<T>(path: string, body: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', body });
  const json = await parseJsonSafe(res);
  if (!res.ok) throw new Error(json?.error?.message ?? `リクエストに失敗しました (${res.status})`);
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path: string) => request<void>(path, { method: 'DELETE' }),
  postFile: <T>(path: string, body: FormData) => requestFile<T>(path, body),
};
```

- [ ] **Step 2: materialService の冗長な取得と誤コメントを除去**

`backend/src/services/materialService.ts` の `updateMaterial` を以下に置き換える(存在チェックは `materialController.update` が実施済み):

```typescript
export async function updateMaterial(id: string, input: UpdateMaterialInput) {
  const m = await repo.update(id, input);
  return formatMaterial(m)!;
}
```

- [ ] **Step 3: .env.example の DATABASE_URL に説明を追加**

`backend/.env.example` の1行目を以下に置き換える:

```bash
# Prisma CLI(マイグレーション)専用。アプリ実行時は src/utils/prisma.ts が backend/dev.db を直接参照する
DATABASE_URL="file:./dev.db"
```

- [ ] **Step 4: 検証**

Run: `cd frontend && npm run build && npm test`
Expected: ビルド成功、テストPASS

Run: `cd backend && npm test && npx tsc --noEmit`
Expected: すべてPASS

- [ ] **Step 5: コミット**

```bash
git add frontend/src/services/api.ts backend/src/services/materialService.ts backend/.env.example
git commit -m "fix: 非JSONエラーレスポンスでの例外を防止、materialServiceの冗長な取得を削除"
```

---

### Task 8: 最終検証

**Files:** なし(検証のみ)

- [ ] **Step 1: バックエンドの全チェック**

Run: `cd backend && npm test && npx tsc --noEmit`
Expected: 全テストPASS(diffText / errorHandler / ollamaService / comparisonService / subtitleParser)、型エラーなし

- [ ] **Step 2: フロントエンドの全チェック**

Run: `cd frontend && npm test && npm run lint && npm run build`
Expected: テストPASS、lintエラーなし、ビルド成功

- [ ] **Step 3: 手動スモークテスト**

1. `cd backend && npm run dev` と `cd frontend && npm run dev` を起動
2. ブラウザで教材一覧 → 練習 → 提出 → 採点結果表示が通ることを確認
3. 履歴ページで教材タイトル列が表示されることを確認
4. 教材フォームで「英文成型」に `The U.S. is large.We agree.` を入力して適用し、`U.S.` が壊れず `large. We` に直ることを確認
5. すべて確認できたら完了。問題があれば該当タスクに戻って修正する
