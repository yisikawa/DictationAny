# DictationAny 設計書

## 1. 目的

本設計書は、DictationAny の MVP を React フロントエンド、Node.js バックエンドで実装するための基本設計を定義します。

MVP では、ユーザーが英文などの教材文を登録し、ブラウザ上で読み上げを再生し、聞き取った内容を入力して、原文との差分とスコアを確認できることを目標とします。

## 2. 技術スタック

### フロントエンド

- React
- TypeScript
- Vite
- React Router
- Web Speech API
- CSS Modules または通常の CSS

### バックエンド

- Node.js
- TypeScript
- Express
- SQLite
- Prisma

### テスト

- フロントエンド: Vitest、React Testing Library
- バックエンド: Vitest または Jest、Supertest

## 3. システム構成

```text
[Browser]
  |
  | HTTP / JSON
  v
[React Frontend]
  |
  | REST API
  v
[Node.js + Express API]
  |
  | Prisma
  v
[SQLite Database]
```

音声読み上げは、初期版ではブラウザの Web Speech API を利用します。そのため、TTS 音声生成のためのバックエンド処理は MVP には含めません。

## 4. アプリケーション構成

```text
DictationAny/
  doc/
    planning.md
    design.md
  frontend/
    src/
      app/          # ルーター定義・グローバルプロバイダーなどのアプリ起動処理
      components/
      features/
      pages/
      services/
      styles/
      types/
  backend/
    src/
      app.ts
      server.ts
      routes/
      controllers/
      services/
      repositories/
      integrations/
      utils/
      types/
    prisma/
      schema.prisma
      migrations/
```

## 5. 主要機能

### 5.1 教材管理

ユーザーがディクテーション用の文章を登録、閲覧、編集、削除できる機能です。

MVP 対象:

- 教材一覧表示
- 教材詳細表示
- 教材作成
- 教材編集
- 教材削除

教材データ:

- タイトル
- 本文
- 言語
- 難易度
- タグ
- 取り込み元
- 取り込み元 URL
- タイムスタンプ情報
- 作成日時
- 更新日時

### 5.2 外部教材取り込み

YouTube や Udemy の字幕・文字起こしを教材として取り込みます。

MVP 対象:

- 字幕テキストの貼り付け取り込み
- `.srt`、`.vtt` 形式の字幕ファイル取り込み
- 取り込み元 URL の保存
- 字幕タイムスタンプを使った文・区間単位の分割

後続対象:

- YouTube URL からの字幕候補取得
- Udemy 講座・レクチャー単位の字幕取り込み
- チャプター単位の教材分割
- 元動画の該当時刻へのリンク

注意点:

- 動画や音声ファイル自体は保存しない
- ユーザーが利用権限を持つ字幕・文字起こしのみを対象にする
- YouTube、Udemy など外部サービスの規約に従う

### 5.3 音声読み上げ

教材本文を Web Speech API で読み上げます。

MVP 対象:

- 再生
- 一時停止
- 停止
- 再生速度変更
- 文単位の読み上げ

### 5.4 ディクテーション練習

ユーザーが音声を聞き、聞き取った内容を入力します。

MVP 対象:

- 教材本文の表示切り替え
- 入力欄
- 提出
- 再挑戦

表示モード:

- Practice: 原文を表示して練習
- Blind: 原文を隠して練習

### 5.5 比較・採点

原文とユーザー入力を比較し、結果を表示します。

MVP 対象:

- 単語一致率
- 文字一致率
- 抜けた単語
- 余分な単語
- スペル違い候補
- 差分ハイライト

評価設定:

- 大文字小文字を区別するか
- 句読点を評価対象にするか
- 空白の連続を正規化するか

### 5.6 履歴

練習結果を保存し、後から確認できるようにします。

MVP 対象:

- 教材ごとの最新スコア
- 練習回数
- 過去の提出結果

## 6. 画面設計

### 6.1 ホーム画面

パス:

```text
/
```

表示内容:

- 最近使った教材
- 新規教材作成ボタン
- 練習履歴の概要

### 6.2 教材一覧画面

パス:

```text
/materials
```

表示内容:

- 教材カード一覧
- 検索
- 言語フィルター
- 難易度フィルター
- 取り込み元フィルター

### 6.3 教材作成・編集画面

パス:

```text
/materials/new
/materials/:materialId/edit
```

入力項目:

- タイトル
- 本文
- 言語
- 難易度
- タグ
- 取り込み元 URL

### 6.4 外部教材取り込み画面

パス:

```text
/imports/new
```

入力項目:

- 取り込み元
- YouTube または Udemy の URL
- 字幕テキスト
- 字幕ファイル
- 言語
- 教材タイトル

表示内容:

- 字幕プレビュー
- タイムスタンプごとの分割プレビュー
- 教材として保存する範囲の選択
- 著作権・利用規約に関する確認チェック

### 6.5 練習画面

パス:

```text
/practice/:materialId
```

表示内容:

- 教材タイトル
- 音声操作バー
- 原文表示エリア
- ディクテーション入力エリア
- 提出ボタン
- 表示モード切り替え

### 6.6 結果画面

パス:

```text
/results/:attemptId
```

表示内容:

- 総合スコア
- 単語一致率
- 文字一致率
- 原文と入力文の差分
- ミス分類
- 再挑戦ボタン

## 7. フロントエンド設計

### 7.1 主要コンポーネント

```text
components/
  AppLayout.tsx
  Header.tsx
  MaterialCard.tsx
  ImportSourceForm.tsx
  SubtitlePreview.tsx
  TextToSpeechControls.tsx
  DictationInput.tsx
  DiffViewer.tsx
  ScoreSummary.tsx
  LoadingState.tsx
  ErrorState.tsx
```

### 7.2 feature 単位

```text
features/
  materials/
    api.ts
    hooks.ts
    types.ts
  imports/
    api.ts
    hooks.ts
    subtitleParser.ts
    types.ts
  practice/
    compare.ts
    speech.ts
    hooks.ts
    types.ts
  attempts/
    api.ts
    hooks.ts
    types.ts
```

### 7.3 状態管理

MVP では、React の標準機能を中心に構成します。

- 画面内状態: useState、useReducer
- API データ取得: カスタム hooks
- URL 状態: React Router

アプリ全体で共有する状態が増えた場合のみ、Zustand などの軽量状態管理ライブラリを検討します。

### 7.4 TTS 制御

Web Speech API の `SpeechSynthesisUtterance` を利用します。

主な設定:

- `text`
- `lang`
- `rate`
- `pitch`
- `voice`

注意点:

- ブラウザによって利用可能な音声が異なる
- 一部ブラウザではユーザー操作後でないと再生できない
- 長文は文単位に分割して読み上げる

## 8. バックエンド設計

### 8.1 Express 構成

```text
src/
  app.ts
  server.ts
  routes/
    materialRoutes.ts
    importRoutes.ts
    attemptRoutes.ts
  controllers/
    materialController.ts
    importController.ts
    attemptController.ts
  services/
    materialService.ts
    importService.ts
    subtitleParserService.ts
    attemptService.ts
    comparisonService.ts
  repositories/
    materialRepository.ts
    importRepository.ts
    attemptRepository.ts
  integrations/
    youtubeIntegration.ts
    udemyIntegration.ts
  utils/
    normalizeText.ts
    diffText.ts
    parseTimestamp.ts
```

### 8.2 API 一覧

#### 教材 API

```text
GET    /api/materials?page=1&limit=20
POST   /api/materials
GET    /api/materials/:materialId
PUT    /api/materials/:materialId
DELETE /api/materials/:materialId
```

`page` と `limit` は任意です。MVP では `limit` のデフォルト値を 20 とします。

#### 外部教材取り込み API

```text
POST /api/imports/preview
POST /api/imports/materials
GET  /api/imports/:importId
```

#### 練習結果 API

```text
GET  /api/attempts?materialId=:materialId
POST /api/attempts
GET  /api/attempts/:attemptId
```

`materialId` クエリパラメーターは任意です。省略した場合は全履歴を返します。

#### 比較 API

```text
POST /api/compare
```

MVP ではフロントエンド側でも比較処理を実行できますが、履歴保存と評価ロジックの一貫性を考慮し、最終的な採点はバックエンドで行います。

## 9. API 詳細

### 9.1 教材作成

```http
POST /api/materials
```

リクエスト:

```json
{
  "title": "Short News Article",
  "body": "The city council approved a new public transport plan.",
  "language": "en-US",
  "difficulty": "beginner",
  "tags": ["news", "transport"]
}
```

レスポンス:

```json
{
  "id": "mat_001",
  "title": "Short News Article",
  "body": "The city council approved a new public transport plan.",
  "language": "en-US",
  "difficulty": "beginner",
  "tags": ["news", "transport"],
  "createdAt": "2026-05-20T00:00:00.000Z",
  "updatedAt": "2026-05-20T00:00:00.000Z"
}
```

### 9.2 外部教材プレビュー

```http
POST /api/imports/preview
```

リクエスト:

```json
{
  "sourceType": "youtube",
  "sourceUrl": "https://www.youtube.com/watch?v=example",
  "language": "en-US",
  "subtitleFormat": "vtt",
  "subtitleText": "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nThe city council approved a new public transport plan."
}
```

レスポンス:

```json
{
  "importId": "imp_001",
  "sourceType": "youtube",
  "sourceUrl": "https://www.youtube.com/watch?v=example",
  "title": "Imported YouTube Lesson",
  "language": "en-US",
  "segments": [
    {
      "startTimeMs": 1000,
      "endTimeMs": 4000,
      "text": "The city council approved a new public transport plan."
    }
  ],
  "body": "The city council approved a new public transport plan."
}
```

### 9.3 外部教材保存

```http
POST /api/imports/materials
```

リクエスト:

```json
{
  "importId": "imp_001",
  "title": "Imported YouTube Lesson",
  "sourceType": "youtube",
  "sourceUrl": "https://www.youtube.com/watch?v=example",
  "language": "en-US",
  "difficulty": "beginner",
  "tags": ["youtube", "transport"],
  "segments": [
    {
      "startTimeMs": 1000,
      "endTimeMs": 4000,
      "text": "The city council approved a new public transport plan."
    }
  ]
}
```

レスポンス:

```json
{
  "id": "mat_002",
  "title": "Imported YouTube Lesson",
  "body": "The city council approved a new public transport plan.",
  "language": "en-US",
  "sourceType": "youtube",
  "sourceUrl": "https://www.youtube.com/watch?v=example",
  "createdAt": "2026-05-20T00:00:00.000Z"
}
```

### 9.4 比較

```http
POST /api/compare
```

リクエスト:

```json
{
  "originalText": "The city council approved a new public transport plan.",
  "submittedText": "The city council approve new public transportation plan.",
  "options": {
    "caseSensitive": false,
    "ignorePunctuation": true,
    "normalizeWhitespace": true
  }
}
```

レスポンス:

```json
{
  "score": 78,
  "wordAccuracy": 75,
  "characterAccuracy": 88,
  "missingWords": ["a"],
  "extraWords": ["transportation"],
  "possibleSpellingErrors": [
    {
      "expected": "approved",
      "actual": "approve"
    }
  ],
  "diff": [
    {
      "type": "equal",
      "text": "The city council"
    },
    {
      "type": "replace",
      "expected": "approved",
      "actual": "approve"
    },
    {
      "type": "missing",
      "text": "a"
    },
    {
      "type": "replace",
      "expected": "transport",
      "actual": "transportation"
    },
    {
      "type": "equal",
      "text": "plan"
    }
  ]
}
```

### 9.5 練習結果保存

```http
POST /api/attempts
```

リクエスト:

```json
{
  "materialId": "mat_001",
  "submittedText": "The city council approve new public transportation plan.",
  "options": {
    "caseSensitive": false,
    "ignorePunctuation": true,
    "normalizeWhitespace": true
  }
}
```

レスポンス:

```json
{
  "id": "att_001",
  "materialId": "mat_001",
  "submittedText": "The city council approve new public transportation plan.",
  "score": 78,
  "wordAccuracy": 75,
  "characterAccuracy": 88,
  "createdAt": "2026-05-20T00:00:00.000Z"
}
```

## 10. データベース設計

### 10.1 Material

```prisma
model Material {
  id             String            @id @default(cuid())
  title          String
  body           String
  language       String
  difficulty     String?
  tags           String?
  sourceType     String            @default("manual")
  sourceUrl      String?
  sourceMetadata String?
  segments       MaterialSegment[]
  attempts       Attempt[]
  importJob      ImportJob?
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt
}
```

`tags` と `sourceMetadata` は MVP では JSON 文字列として保存します。検索要件が強くなった段階で別テーブル化を検討します。

`sourceType` は以下を想定します。

- manual
- text_file
- subtitle_file
- youtube
- udemy
- web_article

### 10.2 MaterialSegment

```prisma
model MaterialSegment {
  id          String   @id @default(cuid())
  materialId  String
  material    Material @relation(fields: [materialId], references: [id], onDelete: Cascade)
  startTimeMs Int?
  endTimeMs   Int?
  text        String
  orderIndex  Int
  createdAt   DateTime @default(now())
}
```

YouTube や Udemy の字幕から取り込んだ教材では、`MaterialSegment` に字幕の区間情報を保存します。これにより、練習画面から元動画の該当時刻へ移動するリンクや、区間単位のディクテーションを実現できます。

### 10.3 ImportJob

```prisma
model ImportJob {
  id             String    @id @default(cuid())
  sourceType     String
  sourceUrl      String?
  title          String?
  language       String
  status         String
  rawText        String?
  parsedJson     String?
  errorMessage   String?
  materialId     String?
  material       Material? @relation(fields: [materialId], references: [id])
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}
```

`ImportJob` は字幕プレビュー、取り込み失敗理由、取り込み元情報の確認に使います。`parsedJson` にはセグメント配列やメタデータを JSON 文字列として保存します。

`materialId` は `POST /api/imports/materials` で Material が作成された後にセットします。これにより、どの ImportJob からどの Material が生成されたかを追跡できます。

### 10.4 Attempt

```prisma
model Attempt {
  id                String   @id @default(cuid())
  materialId        String
  material          Material @relation(fields: [materialId], references: [id], onDelete: Cascade)
  submittedText     String
  score             Int
  wordAccuracy      Int
  characterAccuracy Int
  resultJson        String
  createdAt         DateTime @default(now())
}
```

`resultJson` には差分、ミス分類、評価オプションを JSON 文字列として保存します。

## 11. 外部教材取り込み処理

### 11.1 入力方式

MVP では、外部サービスから直接データを取得する前に、字幕テキストの貼り付けと字幕ファイルアップロードを優先します。

対応形式:

- プレーンテキスト
- SRT
- WebVTT

### 11.2 YouTube 取り込み

YouTube 取り込みでは、動画 URL と字幕テキストを受け取り、教材本文と字幕セグメントに変換します。

保存する情報:

- sourceType: youtube
- sourceUrl: YouTube 動画 URL
- sourceMetadata: 動画 ID、動画タイトル、チャンネル名、字幕言語
- MaterialSegment: 字幕ごとの開始時刻、終了時刻、本文

後続機能として、字幕取得 API やユーザー提供の字幕ファイルを利用した自動取得を検討します。

### 11.3 Udemy 取り込み

Udemy 取り込みでは、ユーザーが受講権限を持つ講座の字幕・文字起こしを教材化します。

保存する情報:

- sourceType: udemy
- sourceUrl: 講座またはレクチャー URL
- sourceMetadata: 講座名、セクション名、レクチャー名、字幕言語
- MaterialSegment: 字幕ごとの開始時刻、終了時刻、本文

Udemy 連携は、ログイン済みユーザーの受講権限やサービス規約に関わるため、MVP では直接連携せず、字幕テキストの貼り付けまたはファイル取り込みを優先します。

### 11.4 セグメント生成

字幕ファイルにタイムスタンプがある場合は、区間ごとに `MaterialSegment` を作成します。タイムスタンプがない場合は、文単位または段落単位で分割します。

### 11.5 権利と保存方針

- 動画ファイルや音声ファイルは保存しない
- 字幕・文字起こし本文のみを教材として保存する
- ユーザーが利用権限を持つ教材のみ取り込む
- 外部サービスの規約に反する自動取得は行わない

## 12. 比較アルゴリズム

### 12.1 正規化

比較前に以下の正規化を行います。

- 前後空白の削除
- 連続空白の 1 文字化
- 大文字小文字の統一
- 句読点の除去

正規化は評価オプションに応じて切り替えます。

### 12.2 単語分割

英語 MVP では、空白区切りで単語配列を作成します。

将来的には言語ごとに tokenizer を切り替えます。

### 12.3 diff

単語配列に対して LCS を使い、以下の差分を生成します。

- equal
- missing
- extra
- replace

### 12.4 スコア計算

初期スコア:

```text
wordAccuracy      = matchedWordCount / originalWordCount * 100
characterAccuracy = max(0, 1 - levenshteinDistance / originalCharacterCount) * 100
score             = round(wordAccuracy * 0.7 + characterAccuracy * 0.3)
```

`characterAccuracy` に `max(0, ...)` を適用するのは、提出文が極端に短い場合に負値になるのを防ぐためです。
また、`wordAccuracy` と単位を揃えるため `* 100` して 0〜100 スケールに統一します。

## 13. エラーハンドリング

### フロントエンド

- API 通信エラーを画面上に表示
- 保存失敗時は入力内容を保持
- TTS 非対応ブラウザでは代替メッセージを表示

### バックエンド

- バリデーションエラー: 400
- 存在しないリソース: 404
- サーバーエラー: 500

エラーレスポンス:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Title is required."
  }
}
```

## 14. バリデーション

### Material

- title: 必須、1 文字以上 120 文字以下
- body: 必須、1 文字以上
- language: 必須、BCP 47 形式を推奨
- difficulty: 任意
- tags: 任意
- sourceType: 任意、未指定時は manual
- sourceUrl: 任意、URL 形式

### Import

- sourceType: 必須、youtube または udemy または subtitle_file
- sourceUrl: 任意、指定時は URL 形式
- subtitleText: subtitleFile がない場合は必須
- subtitleFile: subtitleText がない場合は必須
- language: 必須、BCP 47 形式を推奨
- title: 任意、未指定時は取り込み元情報から生成

### Attempt

- materialId: 必須
- submittedText: 必須
- options: 任意

## 15. セキュリティ

MVP では認証を含めません。ただし、後から認証を追加しやすいように、API とデータモデルはユーザー所有を拡張できる設計にします。

### MVP 対象

- CORS 設定（開発時は `http://localhost:5173` を許可、本番は適切なオリジンに制限）

Vite フロントエンド（:5173）と Express バックエンド（:3000）はオリジンが異なるため、開発初日から CORS 設定が必要です。

### 将来的な追加項目

- User テーブル
- userId による教材と履歴の所有
- JWT またはセッション認証
- 入力本文の最大サイズ制限
- 字幕ファイルの最大サイズ制限
- rate limit
- 外部サービスの利用規約に反する自動取得の禁止

## 16. 開発順序

1. React / Node.js / TypeScript のプロジェクト作成
2. Prisma と SQLite のセットアップ
3. 教材 CRUD API の実装
4. 教材一覧・作成・編集画面の実装
5. 字幕貼り付け・字幕ファイル取り込みの実装
6. Web Speech API による読み上げ機能の実装
7. 比較ロジックの実装
8. 練習画面と結果画面の実装
9. 練習結果保存 API の実装
10. 履歴表示の実装
11. テスト追加

## 17. MVP 完了条件

- ユーザーが教材を登録できる
- ユーザーが YouTube または Udemy 由来の字幕テキストを教材として取り込める
- 登録した教材を一覧から選択できる
- 教材本文をブラウザで読み上げできる
- ユーザーが聞き取った内容を入力できる
- 原文と入力文の差分を確認できる
- スコアが表示される
- 練習結果が保存される
- 過去の練習結果を確認できる

## 18. 非対象範囲

MVP では以下を対象外とします。

- ユーザー認証
- 教師用クラス管理
- AI による解説
- 発音録音と発音評価
- PDF 取り込み
- Web 記事 URL からの本文抽出
- YouTube からの字幕自動取得
- Udemy との直接 API 連携
- モバイルアプリ
- 外部 TTS API
