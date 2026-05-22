# リファクタリング提案

作成日: 2026-05-22

---

## 1. `PracticePage.tsx` の分割（最優先）

**問題:** 320行・11個のstateが1コンポーネントに集中している。

**対応:** 関心事ごとにカスタムフックへ抽出する。

```
PracticePage
├── useMicTest()   ← testingMic / testStream / meterVisible / deviceSelect
├── useRecording() ← recording / interim / soundDetected / micError / toggleRecording
└── useSubmit()    ← submitting / submitError / handleSubmit
```

`useMicTest` と `useRecording` はほぼ独立した関心事であり、ユニットテストも書きやすくなる。

---

## 2. 汎用 `useFetch` フックの抽出

**問題:** `frontend/src/features/materials/hooks.ts` の `loading / error / data` パターンが `useMaterials` と `useMaterial` で重複している。

**対応:** 汎用フックとして抽出する。

```ts
// 抽出先: frontend/src/hooks/useFetch.ts
function useFetch<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ...
}
```

将来的に TanStack Query へ移行する場合も、この層が移行ポイントになる。

---

## 3. バックエンド: `resultJson` のパース場所を統一

**問題:** `backend/src/controllers/attemptController.ts` の `getOne`（16行目）と `create`（25行目）の両方で `JSON.parse(attempt.resultJson)` が重複している。

**対応:** リポジトリ層で変換済みの値を返すヘルパー関数に集約する。

```ts
// attemptRepository.ts 内に追加
function toAttemptWithResult(raw: Attempt) {
  return { ...raw, result: JSON.parse(raw.resultJson) };
}
```

コントローラー側は `toAttemptWithResult(attempt)` を呼ぶだけにする。

---

## 4. CORS origin の環境変数化

**問題:** `backend/src/app.ts:10` の `'http://localhost:5173'` がハードコードされており、本番デプロイ時に変更が必要。

**対応:** 環境変数で上書きできるようにする。

```ts
cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' })
```

`.env` に `CORS_ORIGIN=https://example.com` を追加するだけで対応できる。

---

## 5. バックエンド入力バリデーションの Zod 化

**問題:** `backend/src/controllers/attemptController.ts:21-22` のように手動チェックになっており、エラーメッセージや型推論が散在している。

**対応:** Zod スキーマで一元化する。

```ts
import { z } from 'zod';

const CreateAttemptSchema = z.object({
  materialId: z.string().min(1),
  submittedText: z.string().min(1),
  options: z.record(z.unknown()).optional(),
});
```

バリデーションエラーのレスポンス形式も統一できる。

---

## 6. 型定義の共有（中長期）

**問題:** `frontend/src/types/index.ts` と `backend/src/types/index.ts` で `Material`・`Attempt` などが重複定義されており、片方を変更した際にドリフトが発生しやすい。

**対応:** `packages/types` という共有パッケージに切り出す（monorepo 化が前提）。

```
DictationAny/
├── backend/
├── frontend/
└── packages/
    └── types/       ← 共有型定義
        └── index.ts
```

---

## 優先順位まとめ

| 優先度 | 内容 | 効果 |
|--------|------|------|
| 高 | PracticePage の hook 分割 | 可読性・テスト容易性 |
| 高 | `resultJson` パース統一 | バグ混入防止 |
| 中 | 汎用 `useFetch` | DRY・将来のライブラリ移行に備え |
| 中 | CORS 環境変数化 | デプロイ対応 |
| 低 | Zod バリデーション | 型安全性向上 |
| 低 | 型共有パッケージ | monorepo 化が必要 |
