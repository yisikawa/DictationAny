# リファクタリング提案

作成日: 2026-05-22
更新日: 2026-05-22

---

## 目的

現在のコードベースは、フロントエンドは Vite + React、バックエンドは Express + Prisma で素直に分離されている。一方で、画面コンポーネント・API レスポンス変換・入力バリデーションに責務の集中と重複が見え始めている。

この提案では、機能追加を止めずに小さく進められる順番で、保守性・テスト容易性・デプロイ耐性を上げる。

---

## 1. `PracticePage.tsx` の分割（最優先）

**対象:** `frontend/src/pages/PracticePage.tsx`

**問題:**

- 録音、マイクテスト、音量メーター、提出処理、表示モードが 1 コンポーネントに集中している。
- `useState` が多く、録音まわりの副作用と画面描画が混ざっている。
- Web Speech API と MediaStream の cleanup 条件を追いにくい。

**対応:**

関心事ごとにカスタムフックへ抽出する。

```txt
PracticePage
├── useMicTest()        testingMic / testStream / meterVisible / deviceSelect
├── useRecording()      recording / interim / soundDetected / micError / toggleRecording
├── usePracticeSubmit() submitting / submitError / handleSubmit
└── appendRecognizedText() は pure function として維持
```

**期待効果:**

- `PracticePage` は画面構成に集中できる。
- 録音・マイクテストの cleanup を個別に確認しやすくなる。
- `appendRecognizedText` や録音状態遷移の単体テストを追加しやすくなる。

---

## 2. API クライアントの空レスポンス対応

**対象:** `frontend/src/services/api.ts`

**問題:**

現在の `request()` は常に `res.json()` を呼ぶため、`DELETE` などの `204 No Content` レスポンスで失敗する可能性がある。

**対応:**

空レスポンスを安全に扱う `parseJsonSafe()` を追加する。

```ts
async function parseJsonSafe(res: Response) {
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
```

**期待効果:**

- `api.delete()` が HTTP の一般的なレスポンス形式に強くなる。
- バックエンド側で `204` を返す実装を安心して使える。

---

## 3. バックエンド: `resultJson` のパース場所を統一

**対象:**

- `backend/src/controllers/attemptController.ts`
- `backend/src/repositories/attemptRepository.ts`

**問題:**

`getOne` と `create` の両方で `JSON.parse(attempt.resultJson)` が重複している。レスポンス形を変更したい場合に漏れやすい。

**対応:**

レスポンス変換を 1 箇所に集約する。

```ts
function toAttemptResponse(raw: Attempt) {
  return {
    ...raw,
    result: JSON.parse(raw.resultJson),
  };
}
```

置き場所は、まずは `attemptRepository.ts` か `attemptMapper.ts` がよい。コントローラーは `res.json(toAttemptResponse(attempt))` のように薄く保つ。

**期待効果:**

- `Attempt` の API レスポンス形が安定する。
- `resultJson` の内部表現を将来変える場合も影響範囲が狭くなる。

---

## 4. `loading / error / data` パターンの共通化

**対象:**

- `frontend/src/features/materials/hooks.ts`
- `frontend/src/pages/ResultPage.tsx`
- `frontend/src/pages/HistoryPage.tsx`

**問題:**

非同期取得の `loading / error / data` 管理が複数箇所に散っている。エラー文言や reload の有無も揺れやすい。

**対応:**

小さな `useAsyncResource` または `useFetch` を追加する。

```ts
function useAsyncResource<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ...
  return { data, loading, error, reload };
}
```

**注意:**

いきなり全画面に適用せず、まず `useMaterials` と `useMaterial` から始める。将来的に TanStack Query へ移行する場合も、この層が移行ポイントになる。

---

## 5. バックエンド入力バリデーションの共通化

**対象:**

- `backend/src/controllers/materialController.ts`
- `backend/src/controllers/importController.ts`
- `backend/src/controllers/attemptController.ts`
- `backend/src/routes/compareRoutes.ts`

**問題:**

手動チェックが各コントローラーに散っている。エラーレスポンス形式は似ているが、条件・メッセージ・型推論は統一されていない。

**対応案 A: 軽量ヘルパーから始める**

```ts
function validationError(res: Response, message: string) {
  return res.status(400).json({
    error: { code: 'VALIDATION_ERROR', message },
  });
}
```

**対応案 B: Zod を導入する**

```ts
const CreateAttemptSchema = z.object({
  materialId: z.string().min(1),
  submittedText: z.string().min(1),
  options: z.record(z.unknown()).optional(),
});
```

**推奨:**

短期は案 A、入力項目が増えてきたら案 B。Zod 化する場合はレスポンス形式を統一する middleware も同時に用意する。

---

## 6. フォーム値から API payload への変換を関数化

**対象:**

- `frontend/src/pages/MaterialNewPage.tsx`
- `frontend/src/pages/MaterialEditPage.tsx`
- `frontend/src/components/MaterialForm.tsx`

**問題:**

`tags` のカンマ分割、空文字を `undefined` にする処理、`difficulty` の変換がページ側に重複している。

**対応:**

`toMaterialPayload(values)` のような変換関数を作る。

```ts
function toMaterialPayload(values: MaterialFormValues) {
  return {
    title: values.title,
    body: values.body,
    language: values.language,
    difficulty: values.difficulty || undefined,
    tags: values.tags.split(',').map(t => t.trim()).filter(Boolean),
    sourceUrl: values.sourceUrl || undefined,
  };
}
```

**期待効果:**

- 新規作成と編集で API payload の形が揃う。
- 将来 `tags` UI をチップ入力などに変えるときの修正箇所が減る。

---

## 7. CORS origin と API base URL の環境変数化

**対象:**

- `backend/src/app.ts`
- `frontend/src/services/api.ts`

**問題:**

バックエンドの CORS origin が `http://localhost:5173` に固定されている。フロントの API base も `/api` 固定のため、デプロイ構成によっては変更が必要になる。

**対応:**

```ts
cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' })
```

フロント側は Vite の環境変数を使う。

```ts
const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';
```

**期待効果:**

- ローカル、LAN、デプロイ先で設定だけを差し替えられる。
- iPhone / iPad からの HTTPS アクセス検証とも相性がよい。

---

## 8. 型定義の共有（中長期）

**対象:**

- `frontend/src/types/index.ts`
- `backend/src/types/index.ts`

**問題:**

`Material`, `ImportSegment`, `CompareResult` などがフロントとバックエンドで重複している。片方だけ変更すると型のドリフトが起きる。

**対応:**

中長期で `packages/types` を作り、共有型を切り出す。

```txt
DictationAny/
├── backend/
├── frontend/
└── packages/
    └── types/
        └── index.ts
```

**注意:**

monorepo 設定、ビルド設定、パッケージ参照の整理が必要になるため、今すぐ着手するよりも API 仕様がもう少し固まってからでよい。

---

## 推奨実装順

| 順位 | 内容 | 効果 | リスク |
|---:|---|---|---|
| 1 | `PracticePage.tsx` の hook 分割 | 可読性・テスト容易性が大きく改善 | 中 |
| 2 | API クライアントの空レスポンス対応 | `204` 系の実行時エラーを防止 | 低 |
| 3 | `resultJson` パース統一 | API レスポンス形の変更に強くなる | 低 |
| 4 | `loading / error / data` 共通化 | 画面取得処理の重複削減 | 中 |
| 5 | フォーム payload 変換の関数化 | 新規・編集の挙動を揃えやすい | 低 |
| 6 | バリデーション共通化 | エラーレスポンスと型安全性を改善 | 中 |
| 7 | 環境変数化 | デプロイ・LAN 検証に強くなる | 低 |
| 8 | 型定義の共有 | フロント・バックエンド間のドリフト防止 | 高 |

---

## 最初の 1 イテレーション案

まずは影響範囲が読みやすいものから着手する。

1. `frontend/src/services/api.ts` に `parseJsonSafe()` を追加する。
2. `backend/src/repositories/attemptRepository.ts` か `attemptMapper.ts` に `toAttemptResponse()` を追加する。
3. `PracticePage.tsx` から `usePracticeSubmit()` だけを先に抽出する。

この 3 つなら、既存 UI を大きく動かさずにリファクタリングの土台を作れる。
