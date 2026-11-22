# 英語音声からの教材作成機能 設計案

**ステータス:** 提案（未実装・レビュー待ち）
**作成日:** 2026-11-22
**対象:** `backend/`（Express 5 + Prisma 7）、`frontend/`（React 19 + Vite 8）

**Goal:** 英語の音声ファイル（mp3 / m4a / wav 等）、および YouTube 動画の音声から文字起こしを行い、タイムスタンプ付きセグメントを持つディクテーション教材を作成できるようにする。

**Architecture:** 既存の `routes → controllers → services → repositories` 構成を踏襲する。文字起こしは STT プロバイダを差し替え可能なインターフェース越しに呼び出し、既定はローカルの `whisper.cpp`（外部送信なし）。処理は数分かかり得るため `ImportJob` を非同期ジョブとして使って進捗を保存し、フロントはポーリングで状態を取得する。音声ファイルは一時ディレクトリに置き、処理完了時に必ず削除する（既存方針「動画・音声ファイル自体は保存しない」を維持）。

---

## 1. 背景と現状のギャップ

現状の「YouTube から取り込む」は、実体としては**字幕テキストの貼り付け／SRT・WebVTT のパースのみ**であり、URL から字幕や音声を取得する処理は存在しない。

| 項目 | 現状 | 本設計で追加するもの |
|---|---|---|
| 字幕貼り付け取り込み | 実装済み（`POST /api/imports/preview`） | 変更なし |
| 字幕ファイル取り込み | 実装済み（同上、`subtitleFormat` で判定） | 変更なし |
| PDF 取り込み | 実装済み（`POST /api/imports/pdf/preview`、multer memory + pdf-parse） | 変更なし |
| **音声ファイル → 教材** | **未実装** | `POST /api/imports/audio` 他 |
| **YouTube 音声 → 教材** | **未実装**（`doc/design.md` L948 で後続扱い） | `POST /api/imports/youtube-audio` |
| 音声認識（STT） | 練習画面のブラウザ `SpeechRecognition`（マイク入力）のみ | サーバー側 STT 基盤 |
| `ImportJob.status` | `preview` / `completed` の 2 値運用 | `queued` / `processing` / `failed` を追加（String 列のため enum 変更不要） |

**重要な制約:** ブラウザの `SpeechRecognition` はマイク入力専用で、音声ファイルを渡すことはできない。したがって音声ファイルからの教材化にはサーバー側 STT が必須。

---

## 2. スコープ

### 2.1 対象（IN）

- 音声ファイルのアップロード（mp3 / m4a / aac / wav / ogg / opus / webm / flac、上限 100MB/件）
- サーバー側 STT による文字起こし（タイムスタンプ付きセグメント）
- 文単位へのセグメント統合、ノイズタグ（`[Music]` 等）除去
- プレビュー・編集（テキスト修正／セグメント除外・復元）→ 教材保存（`sourceType: 'audio_file'`）
- 進捗表示（0〜100%）と失敗理由の表示
- YouTube URL からの音声取得 → 文字起こし（`sourceType: 'youtube_audio'`、Phase 2）
- 文字起こし結果の簡易整形（既存 `formatEnglishText` の任意適用）

### 2.2 対象外（OUT）

- 動画・音声ファイルの永続保存、CDN 配信、教材からの音声再生（TTS のまま）
- 話者分離（diarization）、発音評価、字幕の自動翻訳
- 認証・ユーザーごとの課金管理（既存方針どおり MVP では認証なし）
- Udemy の直接連携（`doc/design.md` 11.3 の方針を維持）

---

## 3. 方式比較と推奨

| 方式 | 実装コスト | 精度 | ランニングコスト | オフライン | タイムスタンプ | 備考 |
|---|---|---|---|---|---|---|
| **whisper.cpp（ローカル CLI）** | 低（子プロセス起動のみ、npm 依存追加なし） | 中〜高（モデル次第） | 無料 | ○ | ○（`offsets`） | 既定案。Windows でそのまま動く |
| faster-whisper（Python/Docker の HTTP サーバー） | 中（別プロセスの運用が必要） | 高 | 無料 | ○ | ○（`verbose_json`） | Python 環境の用意が前提 |
| OpenAI 互換 API（OpenAI / Groq 等） | 低（`fetch` のみ） | 最高 | 従量課金 | × | ○ | 音声を外部送信する。任意プロバイダとして用意 |
| ブラウザ Web Speech API | 低 | 中 | 無料 | ×（Chrome はクラウド） | × | **音声ファイルを渡せないため不可** |
| YouTube 字幕の取得（yt-dlp `--write-auto-subs`） | 低 | 公式字幕は高 | 無料 | ○ | ○ | STT 不要。まず字幕を試す（Phase 2） |

**推奨:**

1. STT は `SttProvider` インターフェースで抽象化し、**既定を `whisper-cpp`（完全ローカル）**、任意で `openai-compatible` を選べるようにする。既存の Ollama 連携（`OLLAMA_BASE_URL` / `OLLAMA_MODEL`）と同じ「ローカル既定＋環境変数で差し替え」の思想に揃える。
2. 音声フォーマットの正規化は **ffmpeg に委譲**（16kHz / モノラル / PCM WAV）。whisper.cpp のビルド差（mp3 対応可否）に依存しない。
3. YouTube は「字幕が取れれば字幕 → 取れなければ音声を STT」の順にフォールバックする。

---

## 4. 全体アーキテクチャ

```
[Frontend]                         [Backend]                                 [Local/Remote]
ImportAudioPage
  ├─ POST /api/imports/audio  ──▶  importController.startAudio
  │   (multipart)                    └─ transcriptionService.startAudioImport
  │                                       ├─ ImportJob(status=queued) を返す(202)
  │                                       └─ runTranscription() を fire-and-forget
  │                                            ├─ ffmpeg: 16k mono wav ─────────▶ ffmpeg
  │                                            ├─ sttProvider.transcribe ───────▶ whisper-cli / STT API
  │                                            │    └─ 進捗(%) を ImportJob に間引き更新
  │                                            └─ whisperJson → 文単位セグメント
  │                                                 → ImportJob(status=completed)
  ├─ GET /api/imports/:id (2秒間隔) ─▶ importController.getOne（進捗・状態・結果）
  └─ POST /api/imports/materials ──▶ 既存 saveImportMaterial（教材＋セグメント保存）
```

## 5. データモデル変更

`ImportJob` に進捗と音声メタ情報を追加する（`Material` / `MaterialSegment` は**変更なし**。既存の `startTimeMs` / `endTimeMs` をそのまま使う）。

```prisma
model ImportJob {
  id             String    @id @default(cuid())
  sourceType     String    // audio_file | youtube_audio | youtube | udemy | subtitle_file | pdf
  sourceUrl      String?
  title          String?
  language       String
  status         String    // queued | processing | completed | preview | failed
  progress       Int       @default(0)   // 0-100（追加）
  durationMs     Int?                    // 音声長（追加）
  mediaFileName  String?                 // 元ファイル名（追加、音声自体は保存しない）
  mediaSizeBytes Int?                    // 元ファイルサイズ（追加）
  sttProvider    String?                 // whisper-cpp | openai-compatible（追加）
  rawText        String?
  parsedJson     String?
  errorMessage   String?
  materialId     String?   @unique
  material       Material? @relation(fields: [materialId], references: [id])
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}
```

**マイグレーション（`prisma/migrations/20261122120000_add_import_job_transcription/migration.sql`）:**

```sql
ALTER TABLE "ImportJob" ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportJob" ADD COLUMN "durationMs" INTEGER;
ALTER TABLE "ImportJob" ADD COLUMN "mediaFileName" TEXT;
ALTER TABLE "ImportJob" ADD COLUMN "mediaSizeBytes" INTEGER;
ALTER TABLE "ImportJob" ADD COLUMN "sttProvider" TEXT;
```

適用: `cd backend && npx prisma migrate dev --name add_import_job_transcription && npx prisma generate`（`prisma/migrations` は既存の `init` に続く形で追加）。

**音声ファイルの保存方針:** `os.tmpdir()/dictationany-audio/` に一時保存し、`finally` で必ず削除する。`ImportJob` にはメタ情報のみ残す（`doc/design.md` 11.5 の「音声ファイルは保存しない」を維持）。

---

## 6. API 設計

`sourceType` の追加値: `audio_file`（音声ファイル）、`youtube_audio`（YouTube 音声）。

### 6.1 音声ファイルの取り込み開始

```
POST /api/imports/audio        Content-Type: multipart/form-data
  file      : 音声ファイル（必須）
  language  : BCP 47（必須。既定 en-US をUI側で選択）
  title     : 任意（未指定時はファイル名から生成）
  model     : 任意（whisper のモデル種別。未指定時は環境変数の既定）
→ 202 Accepted
{
  "importId": "imp_001",
  "status": "queued",
  "progress": 0,
  "sourceType": "audio_file",
  "title": "my-listening-01",
  "language": "en-US"
}
```

- multer は `diskStorage`（`limits.fileSize = AUDIO_MAX_MB`）、`fileFilter` で MIME + 拡張子の両方を検査
- 422/400 系は既存 `validationError()` / `HttpError` の形式に合わせる
- 音声が長すぎる場合は `413`（`AUDIO_MAX_DURATION_SEC` 超過）

### 6.2 YouTube 音声の取り込み開始（Phase 2）

```
POST /api/imports/youtube-audio   application/json
{ "sourceUrl": "https://www.youtube.com/watch?v=...", "language": "en-US", "preferSubtitles": true }
→ 202 Accepted { importId, status: "queued", progress: 0, sourceType: "youtube_audio" }
```

- `sourceUrl` は `youtube.com` / `youtu.be` のみ許可（SSRF 対策としてホストを allowlist 検証）
- `preferSubtitles: true` のときは先に字幕取得を試し、成功すれば STT をスキップ（`sttProvider: null`、`status: completed`）

### 6.3 ジョブ状態の取得（ポーリング／結果取得を兼ねる）

```
GET /api/imports/:importId
→ 200
{
  "importId": "imp_001",
  "sourceType": "audio_file",
  "sourceUrl": null,
  "title": "my-listening-01",
  "language": "en-US",
  "status": "processing",        // queued | processing | completed | failed
  "progress": 42,
  "durationMs": 183000,
  "errorMessage": null,
  "segments": null               // status === "completed" のとき ImportSegment[] を返す
}
```

- 既存 `getOne` は Prisma レコードをそのまま返しているため、**`parsedJson` を `segments` に展開して返す後方互換な拡張**とする（`parsedJson` / `rawText` は巨大になり得るのでレスポンスから除外し、`segments` と `body` を返す）
- ポーリング間隔はフロント側で 2 秒。`completed` / `failed` で停止

### 6.4 教材保存（既存 API を流用）

```
POST /api/imports/materials   （変更なし）
{
  "importId": "imp_001",
  "title": "My Listening 01",
  "sourceType": "audio_file",           // youtube_audio も可
  "sourceUrl": null,
  "language": "en-US",
  "difficulty": "intermediate",
  "tags": ["listening", "audio"],
  "segments": [{ "startTimeMs": 0, "endTimeMs": 4200, "text": "..." }]
}
→ 201 Created（Material）
```

**任意拡張:** `sourceMetadata` に `{ sttProvider, model, durationMs, mediaFileName }` を JSON 文字列で保存する（`Material.sourceMetadata` は既存カラムのためマイグレーション不要）。`saveImportMaterial` に `sourceMetadata` を追加する小改修で対応。

### 6.5 キャンセル（任意・Phase 3）

```
DELETE /api/imports/:importId   → 204（実行中ジョブの AbortController を abort し status=failed）
```

## 7. バックエンド実装設計

### 7.1 追加・変更ファイル

```
backend/src/
  routes/
    importRoutes.ts                 [変更] /audio, /youtube-audio を追加
  controllers/
    importController.ts             [変更] audioUpload(multer/diskStorage), startAudio, startYoutubeAudio,
                                            getOne のレスポンス整形
  services/
    transcriptionService.ts         [新規] ジョブ実行・進捗更新・後始末・中断
    stt/
      types.ts                      [新規] SttProvider / TranscriptResult 型
      index.ts                      [新規] getSttProvider() ファクトリ
      whisperCppProvider.ts         [新規] whisper-cli を spawn
      openAiCompatibleProvider.ts   [新規] /audio/transcriptions を fetch
    youtubeService.ts               [新規] yt-dlp ラッパ（Phase 2）
  utils/
    audioUpload.ts                  [新規] multer 設定・許可形式・一時ディレクトリ
    audioConvert.ts                 [新規] ffmpeg で 16kHz/mono wav に変換、音声長取得
    whisperJson.ts                  [新規] whisper JSON → ImportSegment[]、文単位統合、ノイズ除去
    processRunner.ts                [新規] child_process.spawn の共通ラッパ（タイムアウト/中断/出力収集）
  __tests__/
    whisperJson.test.ts             [新規]
    audioUpload.test.ts             [新規]
    transcriptionService.test.ts    [新規]（STT プロバイダをモック）
```

`app.ts` は変更不要（`importRoutes` に追記するだけ）。`server.ts` に起動時のジョブ復旧処理を 1 か所追加する。

### 7.2 STT プロバイダのインターフェース

```ts
// services/stt/types.ts
import type { ImportSegment } from '../../types';

export interface SttOptions {
  language: string;                       // 'en' / 'ja' など（BCP 47 の主言語部に正規化）
  signal?: AbortSignal;
  onProgress?: (percent: number) => void; // 0-100
}

export interface TranscriptResult {
  segments: ImportSegment[];   // startTimeMs / endTimeMs 付き
  text: string;                // 全文（rawText 保存用）
  durationMs?: number;
}

export interface SttProvider {
  readonly name: 'whisper-cpp' | 'openai-compatible';
  transcribe(audioPath: string, options: SttOptions): Promise<TranscriptResult>;
}
```

```ts
// services/stt/index.ts
export function getSttProvider(): SttProvider {
  const provider = process.env.STT_PROVIDER ?? 'whisper-cpp';
  if (provider === 'openai-compatible') return openAiCompatibleProvider;
  return whisperCppProvider;
}
```

### 7.3 whisper.cpp プロバイダ（既定）

```ts
// services/stt/whisperCppProvider.ts（要点）
const bin = process.env.WHISPER_CPP_BIN ?? 'whisper-cli';
const modelPath = process.env.WHISPER_MODEL_PATH ?? '';
const threads = process.env.WHISPER_THREADS ?? '4';

const outBase = path.join(path.dirname(audioPath), `whisper-${Date.now()}`);
const args = ['-m', modelPath, '-f', audioPath, '-l', lang, '-t', threads, '-oj', '-of', outBase, '--print-progress'];
await runProcess(bin, args, {
  signal,
  timeoutMs: Number(process.env.STT_TIMEOUT_MS ?? 600_000),
  onStderr: line => {
    const m = /progress\s*=\s*(\d+)%/.exec(line);   // whisper.cpp の進捗出力
    if (m) options.onProgress?.(Math.min(99, Number(m[1])));
  },
});
const json = JSON.parse(await fs.readFile(`${outBase}.json`, 'utf8'));
return toTranscriptResult(json);
```

- `runProcess` は `ENOENT` を捕捉して **503 `STT_UNAVAILABLE`**（「whisper-cli が見つかりません。`WHISPER_CPP_BIN` を設定してください。」）に変換する
- 異常終了時は stderr の末尾 2KB を `errorMessage` に含める（原因切り分け用）
- `signal.abort` 時は `child.kill()` し、`Error('クライアントによって中断されました。')` を投げる（Ollama 連携と同じ扱い）
- `WHISPER_EXTRA_ARGS`（空白区切り）を引数配列に追加できるようにする。`--suppress-nst`（非音声トークン抑制）や `--vad -vm <sileroモデル>` を後から有効化できる（PoC でオプションの存在を確認済み）

### 7.4 OpenAI 互換プロバイダ（任意）

```ts
// services/stt/openAiCompatibleProvider.ts（要点）
const fd = new FormData();
fd.append('file', new Blob([await fs.readFile(audioPath)]), path.basename(audioPath));
fd.append('model', process.env.STT_MODEL ?? 'whisper-1');
fd.append('language', lang);
fd.append('response_format', 'verbose_json');   // segments[]（start/end/text）を得る
const res = await fetch(`${process.env.STT_BASE_URL}/audio/transcriptions`, {
  method: 'POST',
  headers: process.env.STT_API_KEY ? { Authorization: `Bearer ${process.env.STT_API_KEY}` } : {},
  body: fd,
  signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), signal]),
});
```

- `verbose_json` の `segments[].start` / `.end` は**秒**なので `×1000` して `startTimeMs` にする
- 401 / 429 / 5xx をそれぞれ日本語メッセージにマッピング（`STT_AUTH_ERROR` / `STT_RATE_LIMITED` / `STT_UPSTREAM_ERROR`）

### 7.5 音声変換

```ts
// utils/audioConvert.ts
export async function convertToWav16kMono(inputPath: string): Promise<string>;  // 出力 wav パス
export async function probeDurationMs(filePath: string): Promise<number | undefined>; // ffprobe（任意）
```

`ffmpeg -y -i <input> -ar 16000 -ac 1 -c:a pcm_s16le <out.wav>`。`ffmpeg` が無い場合（`ENOENT`）は **503 `FFMPEG_UNAVAILABLE`**。`AUDIO_MAX_DURATION_SEC` 超過は **413**。

### 7.6 whisper JSON → セグメント

```ts
// utils/whisperJson.ts
export interface WhisperJson { transcription: { offsets: { from: number; to: number }; text: string }[] }

export function stripNonSpeechTags(text: string): string;            // [Music], (applause) 等を除去
export function mergeSegmentsToSentences(segments: ImportSegment[], opts?: {
  maxChars?: number;      // 既定 240
  maxDurationMs?: number; // 既定 12000
}): ImportSegment[];
export function toTranscriptResult(json: WhisperJson): TranscriptResult;
```

統合ルール:

1. 断片を連結し、`. ! ?` で終わるか `maxChars` / `maxDurationMs` を超えたら 1 セグメントとして確定
2. 空白を 1 つに正規化し、先頭の空白を除去
3. 連続する完全同一文字列（Whisper のループ hallucination）を除去
4. `stripNonSpeechTags` 後に空になるセグメントは捨てる（無音時の `[BLANK_AUDIO]` もこれで除去できることを PoC で確認）

**品質ガード（PoC の結果を反映）:** 5秒を超えるセグメントで文字密度が 4文字/秒未満のものは「認識が不完全な可能性」と判定し、`GET /api/imports/:importId` のレスポンスに `warnings: [{ startTimeMs, endTimeMs, reason: 'low_speech_density' }]` として含める（保存はせず読み取り時に算出）。プレビュー画面では該当行に ⚠ を表示する。PoC では small/medium が冒頭27秒の音声を1文に圧縮したケースをこの判定で検出できた。

### 7.7 ジョブ実行（`transcriptionService.ts`）

```ts
const running = new Map<string, AbortController>();

export async function startAudioImport(input: {
  filePath: string; fileName: string; fileSize: number;
  language: string; title?: string;
}): Promise<ImportJob> {
  const job = await prisma.importJob.create({ data: {
    sourceType: 'audio_file', language: input.language,
    title: input.title ?? null, status: 'queued', progress: 0,
    mediaFileName: input.fileName, mediaSizeBytes: input.fileSize,
    sttProvider: getSttProvider().name,
  }});
  void runTranscription(job.id, input.filePath, input.language);  // fire-and-forget
  return job;
}

async function runTranscription(jobId: string, filePath: string, language: string) {
  const abort = new AbortController();
  running.set(jobId, abort);
  let lastSaved = 0;
  let wavPath: string | undefined;
  try {
    await updateJob(jobId, { status: 'processing' });
    wavPath = await convertToWav16kMono(filePath);
    const result = await getSttProvider().transcribe(wavPath, {
      language: toIso6391(language),
      signal: abort.signal,
      onProgress: p => {
        if (p - lastSaved >= 5) { lastSaved = p; void updateJob(jobId, { progress: p }); }
      },
    });
    const segments = mergeSegmentsToSentences(result.segments);
    await updateJob(jobId, {
      status: 'completed', progress: 100,
      durationMs: result.durationMs ?? null,
      rawText: result.text, parsedJson: JSON.stringify(segments),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '文字起こしに失敗しました。';
    await updateJob(jobId, { status: 'failed', errorMessage: message });
  } finally {
    running.delete(jobId);
    await cleanupTemp([filePath, wavPath]);   // 中間wavも含め、失敗時も必ず削除
  }
}
```

- `updateJob` / `cleanupTemp` / `AUDIO_TMP_DIR` は新規 export 不要の内部ヘルパー（`transcriptionService.ts` と `utils/audioUpload.ts` に配置）。`AUDIO_TMP_DIR` は起動時に `fs.mkdir(..., { recursive: true })` で作成する

- 進捗の DB 書き込みは **5% 刻みに間引き**（SQLite への書き込み過多を避ける）
- **サーバ再起動時の復旧:** `server.ts` で `listen` 前に `prisma.importJob.updateMany({ where: { status: { in: ['queued','processing'] } }, data: { status: 'failed', errorMessage: 'サーバ再起動により処理が中断されました。' } })` を実行（インメモリの `running` が失われるため）
- 同時実行は 1 本に制限（実行中に開始要求が来たら **429 `BUSY`**）。CPU を占有する STT を多重起動しない

### 7.8 ルーティング追加

```ts
// routes/importRoutes.ts（追記）
router.post('/audio', audioUpload.single('file'), asyncHandler(ctrl.startAudio));
router.post('/youtube-audio', asyncHandler(ctrl.startYoutubeAudio));   // Phase 2
```

```ts
// utils/audioUpload.ts（要点）
export const AUDIO_MIME = new Set(['audio/mpeg','audio/mp4','audio/x-m4a','audio/aac','audio/wav','audio/x-wav','audio/ogg','audio/opus','audio/webm','audio/flac']);
export const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|opus|webm|flac)$/i;
export const audioUpload = multer({
  storage: multer.diskStorage({ destination: AUDIO_TMP_DIR, filename: uniqueName }),
  limits: { fileSize: Number(process.env.AUDIO_MAX_MB ?? 100) * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, AUDIO_MIME.has(file.mimetype) && AUDIO_EXT.test(file.originalname)),
});
```

- `fileFilter` で拒否した場合 `req.file` が未定義になるため、`startAudio` 側で **400 `UNSUPPORTED_AUDIO_FORMAT`**（対応形式を列挙）を返す
- 既存 `errorHandler` のサイズ超過メッセージ（現在「上限(20MB)」固定）は `AUDIO_MAX_MB` を反映するよう修正する

### 7.9 YouTube（Phase 2）

```ts
// services/youtubeService.ts
export async function fetchYoutubeAudio(url: string, tmpDir: string): Promise<{ filePath: string; title?: string }>;
export async function fetchYoutubeSubtitles(url: string, language: string, tmpDir: string): Promise<string | null>; // vtt
```

- 字幕優先: `yt-dlp --skip-download --write-auto-subs --write-subs --sub-langs "en.*" --sub-format vtt -o "<tmp>/%(id)s.%(ext)s" <url>`
- 音声: `yt-dlp -x --audio-format wav --audio-quality 0 -o "<tmp>/%(id)s.%(ext)s" <url>`（内部で ffmpeg を使用）
- 取得した VTT は既存 `parseVtt` に渡すため、**STT を経由せず既存パイプラインを再利用**できる
- 失敗時（非公開・年齢制限・地域制限など）は yt-dlp の stderr を要約して `errorMessage` に格納
- **規約遵守:** UI で「利用権限を有するコンテンツのみ取り込む」同意チェックを必須にし、API でも `agreeToTerms: true` を要求（既存 `ImportNewPage` の同意チェックと同じ UX）

---

## 8. フロントエンド実装設計

### 8.1 追加・変更ファイル

```
frontend/src/
  pages/
    ImportAudioPage.tsx            [新規] 音声取り込み画面（upload → processing → preview）
    ImportAudioPage.module.css     [新規]（ImportPdfPage.module.css の dropZone 等を踏襲）
  features/imports/
    api.ts                         [変更] audioPreview / youtubeAudioPreview / getJob を追加
    useTranscriptionJob.ts         [新規] 2秒ポーリング hook
  components/
    SegmentEditor.tsx              [新規・任意] セグメント編集 UI を PDF 画面と共通化
  app/router.tsx                   [変更] { path: 'imports/audio', element: <ImportAudioPage /> }
  pages/MaterialsPage.tsx          [変更] 「音声から取り込む」ボタン追加
  types/index.ts                   [変更] ImportJobResponse / AudioImportResponse 型追加
```

### 8.2 API クライアント追加

```ts
// features/imports/api.ts（追記）
export interface AudioPreviewInput { file: File; language: string; title?: string }

export const importsApi = {
  // ...既存
  audioPreview: (data: AudioPreviewInput) => {
    const fd = new FormData();
    fd.append('file', data.file);
    fd.append('language', data.language);
    if (data.title) fd.append('title', data.title);
    return api.postFile<AudioImportResponse>('/imports/audio', fd);
  },
  youtubeAudioPreview: (data: { sourceUrl: string; language: string; preferSubtitles: boolean; agreeToTerms: boolean }) =>
    api.post<AudioImportResponse>('/imports/youtube-audio', data),
  getJob: (importId: string) => api.get<ImportJobResponse>(`/imports/${importId}`),
};
```

### 8.3 ポーリング hook

```ts
// features/imports/useTranscriptionJob.ts
export function useTranscriptionJob(importId: string | null) {
  const [job, setJob] = useState<ImportJobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!importId) return;
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const next = await importsApi.getJob(importId);
        if (cancelled) return;
        setJob(next);
        if (next.status === 'completed' || next.status === 'failed') return;
        timer = window.setTimeout(poll, 2000);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '状態取得に失敗しました');
      }
    };
    void poll();

    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [importId]);

  return { job, error };
}
```

（`setTimeout` 再帰にすることで、前回応答が返る前に次を投げる多重リクエストを防ぐ）

### 8.4 画面フロー（`ImportAudioPage.tsx`）

`step: 'upload' | 'processing' | 'preview'` の 3 段階。既存 `ImportPdfPage` の構成（フォーム → セグメント編集 → 保存）をそのまま踏襲する。

1. **upload**: ドラッグ&ドロップ or ファイル選択（`accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm,.flac"`）、言語選択（既定 `en-US`）、任意タイトル、「文字起こし開始」
   - クライアント側で `AUDIO_MAX_MB`（既定 100MB）超過を事前チェックして即エラー表示
2. **processing**: 進捗バー（`job.progress`）、経過時間、`queued` / `processing` の状態文言、「中止」ボタン（Phase 3 の `DELETE` 追加後に有効化）
3. **preview**: セグメント一覧（`textarea` で編集、各行に開始時刻 `0:12` を表示）、除外／復元、タイトル・難易度・タグ、**「英文を整形する」チェック（既定 ON）**
   - 整形は `frontend/src/utils/formatEnglishText.ts` の `formatEnglishText()` を**保存前のセグメントテキストに適用**（既存関数を再利用。新規ロジックは追加しない）
4. **保存**: 既存 `importsApi.saveMaterial()` に `sourceType: 'audio_file'`（YouTube は `'youtube_audio'`）で送信 → `/materials` へ遷移

`failed` 時は `errorMessage` を表示し、「戻る」で upload ステップに戻す（一時ファイルはサーバー側で削除済み）。

### 8.5 ルーティング・ナビゲーション

```tsx
// app/router.tsx
{ path: 'imports/audio', element: <ImportAudioPage /> },
```

```tsx
// MaterialsPage.tsx の headerActions に追加
<Link to="/imports/audio" className={styles.btnSecondary}>音声から取り込む</Link>
```

`/imports/new`（字幕）画面の取り込み元に「音声ファイル」を足すのではなく、**別ページ**とする（PDF と同じ扱い。処理時間・進捗表示が異なるため）。

---

## 9. 設定（`backend/.env.example` 追記）

```dotenv
# ---- 音声取り込み / 文字起こし (STT) ----
# 音声ファイル・YouTube音声から教材を作る機能で使用
STT_PROVIDER="whisper-cpp"                 # whisper-cpp | openai-compatible
STT_TIMEOUT_MS="600000"
AUDIO_MAX_MB="100"
AUDIO_MAX_DURATION_SEC="3600"

# whisper.cpp（既定プロバイダ）
# 注意: release zip を展開すると実行ファイルは bin\Release\whisper-cli.exe になる
WHISPER_CPP_BIN="C:\\tools\\whisper.cpp\\bin\\Release\\whisper-cli.exe"
# 英語は *.en モデル、他言語は ggml-small.bin などの多言語モデルを指定する
WHISPER_MODEL_PATH="C:\\tools\\whisper.cpp\\models\\ggml-small.en.bin"
WHISPER_THREADS="8"
# 追加フラグ（例: "--suppress-nst" / "--vad -vm C:\\tools\\whisper.cpp\\models\\ggml-silero-v5.1.2.bin"）
WHISPER_EXTRA_ARGS=""
FFMPEG_PATH="ffmpeg"                       # 16kHz/mono wav 変換に必須

# OpenAI 互換 STT API（任意。faster-whisper-server / Groq / OpenAI 等）
STT_BASE_URL="http://localhost:8000/v1"
STT_MODEL="whisper-1"
STT_API_KEY=""

# YouTube 音声取り込み（Phase 2）
YTDLP_PATH="yt-dlp"
YTDLP_TIMEOUT_MS="300000"
```

`backend/.env` は Git 管理外（既存どおり）。README に「Ollama のセットアップ」と並べて `whisper.cpp` の導入手順（モデル取得・`WHISPER_CPP_BIN` 設定・`ffmpeg` インストール）を追記する。

---

## 10. バリデーションとエラー

| 条件 | ステータス | コード | メッセージ例 |
|---|---|---|---|
| `file` なし | 400 | `VALIDATION_ERROR` | 音声ファイルが必要です。 |
| MIME/拡張子が非対応 | 400 | `UNSUPPORTED_AUDIO_FORMAT` | 対応形式は mp3 / m4a / wav / ogg / webm / flac です。 |
| `AUDIO_MAX_MB` 超過 | 413 | `UPLOAD_ERROR` | ファイルサイズが上限(100MB)を超えています。 |
| `language` なし | 400 | `VALIDATION_ERROR` | language is required. |
| `AUDIO_MAX_DURATION_SEC` 超過 | 413 | `AUDIO_TOO_LONG` | 音声が長すぎます(上限60分)。分割して取り込んでください。 |
| ffmpeg 不在 | 503 | `FFMPEG_UNAVAILABLE` | ffmpeg が見つかりません。`FFMPEG_PATH` を設定してください。 |
| whisper-cli 不在 | 503 | `STT_UNAVAILABLE` | whisper-cli が見つかりません。`WHISPER_CPP_BIN` を設定してください。 |
| モデル未指定/不在 | 503 | `STT_MODEL_UNAVAILABLE` | 音声認識モデルが見つかりません。`WHISPER_MODEL_PATH` を確認してください。 |
| STT API 401/429/5xx | 502/503 | `STT_AUTH_ERROR` / `STT_RATE_LIMITED` / `STT_UPSTREAM_ERROR` | 各日本語メッセージ |
| 実行中に新規開始 | 429 | `BUSY` | 現在ほかの音声を処理中です。完了後に再試行してください。 |
| YouTube URL が不正 | 400 | `INVALID_YOUTUBE_URL` | YouTube の URL を指定してください。 |
| `agreeToTerms` 未指定 | 400 | `TERMS_NOT_AGREED` | 利用権限に関する同意が必要です。 |
| 存在しない importId | 404 | `NOT_FOUND` | ImportJob not found.（既存どおり） |

実装方針:

- 新規エラーは `utils/httpError.ts` に `HttpError` 派生クラス（例 `UnprocessableAudioError`, `ServiceUnavailableError`）を追加し、既存 `errorHandler` に乗せる（`POST /api/imports/*` は `asyncHandler` 経由なので throw で拾える）
- `ocrCorrectRoutes.ts` のように SSE でストリームする方式は採らない。**長時間処理＋モバイル回線切断**に弱いため、ジョブ＋ポーリングを採用する

---

## 11. 権利・セキュリティ・プライバシー

- **音声を外部送信しない構成を既定**にする（`STT_PROVIDER=whisper-cpp`）。`openai-compatible` を選んだ場合のみ外部送信される旨を README / `.env.example` に明記
- 音声ファイルは一時ディレクトリに置き、**成功・失敗を問わず `finally` で削除**。起動時に `AUDIO_TMP_DIR` 内の残骸（24時間以上前）を掃除する
- アップロード上限（100MB / 60分）と同時実行 1 本で CPU・ディスクを保護
- YouTube 取り込みは **`agreeToTerms` を必須**にし、UI に「利用権限を有するコンテンツのみ」「ダウンロードは各サービスの規約に従う」旨を表示。`doc/design.md` 11.5 の方針を踏襲
- `sourceUrl` は allowlist（`youtube.com`, `www.youtube.com`, `m.youtube.com`, `youtu.be`）のみ許可。`yt-dlp` へ渡す引数は配列で組み立て、シェルを介さない（`spawn` の `shell: false`）
- 既存の認証なし方針は維持。将来 `User` を追加する際に `ImportJob` へ `userId` を足せる形（既存どおり String 主キー）を崩さない
- 認証がないため、LAN 内の他端末からアップロード可能である点は README の注意書きに含める

---

## 12. テスト計画

### 12.1 バックエンド（vitest、既存 `npm test`）

| ファイル | 内容 |
|---|---|
| `__tests__/whisperJson.test.ts` | `stripNonSpeechTags` が `[Music]` / `(applause)` を除去する / `mergeSegmentsToSentences` が文末で区切り、`maxChars` で強制分割する / 開始・終了時刻が先頭・末尾から正しく引き継がれる / 連続重複を除去する / `toTranscriptResult` が `offsets.from/to` を ms として読む |
| `__tests__/audioUpload.test.ts` | `AUDIO_MIME` / `AUDIO_EXT` の許可・拒否（`.exe` を弾く、`.mp3` を通す） |
| `__tests__/transcriptionService.test.ts` | STT プロバイダを `vi.mock` し、成功時に `status=completed` / `progress=100` / `parsedJson` が入る、失敗時に `status=failed` と `errorMessage`、`finally` で一時ファイルが削除される、実行中の二重開始が `BUSY` になる |
| `__tests__/importController.test.ts`（任意・supertest） | `POST /api/imports/audio` で `file` 欠落が 400、`GET /api/imports/:id` が `segments` を展開して返す |

`vi.mock('../services/stt')` で `getSttProvider()` を差し替え、**実バイナリに依存しない**テストにする（既存 `ollamaService.test.ts` が `fetch` をスタブしているのと同じ方針）。

### 12.2 フロントエンド（vitest）

| ファイル | 内容 |
|---|---|
| `features/imports/__tests__/useTranscriptionJob.test.ts`（任意・`@testing-library/react` 未導入のため今回は見送り可） | ポーリングが `completed` で停止する |
| 既存 `utils/__tests__/formatEnglishText.test.ts` | 変更なし（整形を再利用するため回帰確認のみ） |

> `@testing-library/react` は未導入のため、フロントのテストは**純関数のみ**に留める方針（既存構成に合わせる）。

### 12.3 手動E2E（README に手順を追記）

1. 30 秒程度の英語音声（mp3）で取り込み → 進捗が 0→100 に進み、3〜10 文のセグメントが生成される
2. セグメントを 1 つ除外・1 つ編集して保存 → 教材一覧に表示され、練習画面で読み上げできる
3. 非対応形式（`.txt` を音声として選択）→ 400 で日本語メッセージ
4. `WHISPER_CPP_BIN` を不正なパスにして取り込み → `failed` と 503 相当のメッセージが画面に出る
5. 処理中にサーバーを再起動 → 次回起動時に該当ジョブが `failed` になり、画面がループしない

---

## 13. タスク分割と工数見積（Phase 1 = 音声ファイル）

| # | タスク | 主なファイル | 見積 |
|---|---|---|---|
| 1 | スキーマ拡張とマイグレーション | `prisma/schema.prisma`, `prisma/migrations/20261122120000_.../migration.sql` | 0.25日 |
| 2 | STT 基盤（型・`processRunner`・`audioConvert`・whisper JSON 変換）＋ 単体テスト | `services/stt/*`, `utils/processRunner.ts`, `utils/audioConvert.ts`, `utils/whisperJson.ts`, `__tests__/whisperJson.test.ts` | 1.0日 |
| 3 | whisper.cpp プロバイダ実装 | `services/stt/whisperCppProvider.ts` | 0.5日 |
| 4 | ジョブ実行サービス（進捗・中断・後始末・同時実行制限・起動時復旧）＋ テスト | `services/transcriptionService.ts`, `server.ts`, `__tests__/transcriptionService.test.ts` | 1.0日 |
| 5 | API（multer/diskStorage・`startAudio`・`getOne` 拡張・エラー追加） | `utils/audioUpload.ts`, `controllers/importController.ts`, `routes/importRoutes.ts`, `utils/httpError.ts`, `middleware/errorHandler.ts` | 0.5日 |
| 6 | フロント画面（upload/processing/preview）＋ API クライアント ＋ ルーティング | `pages/ImportAudioPage.tsx(.module.css)`, `features/imports/api.ts`, `features/imports/useTranscriptionJob.ts`, `app/router.tsx`, `MaterialsPage.tsx`, `types/index.ts` | 1.0日 |
| 7 | OpenAI 互換プロバイダ（任意） | `services/stt/openAiCompatibleProvider.ts` | 0.25日 |
| 8 | ドキュメント（README・`.env.example`・`doc/design.md` 更新）と手動E2E | `README.md`, `backend/.env.example`, `doc/design.md` | 0.5日 |
|  | **Phase 1 合計** |  | **約 5.0 日** |
| 9 | Phase 2: YouTube（字幕優先 → 音声 STT、同意チェック、UI 追加） | `services/youtubeService.ts`, `controllers/importController.ts`, `pages/ImportYoutubeAudioPage.tsx` ほか | 約 1.5〜2.0 日 |

**依存関係:** Task 1 → 2 → 3 → 4 → 5 → 6。Task 7・8 は 5 以降に並行可能。

**実装時の注意（既存慣例）:**

- コミットメッセージは `feat: 音声ファイルから教材を作成する取り込みAPIを追加` の形式
- UI 文言・エラーメッセージは日本語
- `backend/src/generated/prisma/` は生成物のため手編集しない
- `npm` 依存は追加しない（`child_process` / `fetch` / 既存 `multer` のみで完結）

---

## 14. 受け入れ条件（Definition of Done）

1. mp3/m4a/wav の英語音声をアップロードすると、進捗が画面に表示され、完了後にタイムスタンプ付きセグメントのプレビューが出る
2. プレビューでテキスト編集・セグメント除外・復元ができ、教材として保存すると `sourceType='audio_file'`、`MaterialSegment` に `startTimeMs` / `endTimeMs` が入る
3. 保存した教材で既存の練習（読み上げ・採点・履歴）がそのまま動作する
4. 失敗時に日本語の原因メッセージが画面に出て、ジョブが `failed` で確定する（無限ポーリングしない）
5. 音声ファイルがサーバーに残らない（`os.tmpdir()/dictationany-audio/` が空になる）
6. `backend` / `frontend` の既存テストが全て通る（`cd backend && npm test`, `cd frontend && npm test`）
7. `npm run build`（frontend: `tsc -b && vite build` / backend: `tsc`）が成功する

---

## 15. リスクと代替案

| リスク | 影響 | 対策 |
|---|---|---|
| Whisper の精度不足（固有名詞・専門用語） | 教材本文の誤り | base → small/medium へモデル変更を `.env` で可能に。プレビューで手修正（既存 UI）。任意で Ollama による後整形（既存 `correctOcrWithLlm` を流用）を Phase 3 に |
| CPU で長時間（1時間音声で数十分） | タイムアウト・UX 悪化 | `AUDIO_MAX_DURATION_SEC` で上限、進捗表示、同時実行 1 本、`openai-compatible` への切替手段を用意 |
| whisper-cli / ffmpeg の導入がユーザー負担 | 機能が動かない | 起動時 or 初回リクエスト時に存在チェックし、設定手順を案内するメッセージを返す。README に手順を明記 |
| YouTube 側の仕様変更・規約 | 取得失敗 | 字幕優先＋失敗時は音声、それも不可なら明確なエラー。規約同意を必須化。自動取得の間隔制御は行わない |
| サーバー再起動でジョブ消失 | 画面が `processing` のまま | 起動時 `updateMany` で `failed` に確定（7.7） |
| 一時ファイルのディスク圧迫 | ディスク不足 | `finally` 削除＋起動時クリーンアップ＋サイズ上限 |
| `errorHandler` の「20MB」固定文言 | 誤解を招く | `AUDIO_MAX_MB` を反映するよう修正（7.8） |

**代替案（採用しない）:** ブラウザで `MediaRecorder` → `SpeechRecognition` に流す方式は、ファイル音声を入力できない・Chrome はクラウド送信・タイムスタンプが取れないため不採用。

---

## 16. 未決事項（実装前に確認したい点）

1. ~~**STT エンジンの最終決定:**~~ **解決済み（2026-11-22 PoC）:** この PC で `whisper.cpp`（b5907 / CPU ビルド）が正常動作し、実音声 5分20秒を base 15.9s / small 38.9s / medium 110.7s で処理、単語一致率 93〜97%。既定 `whisper-cpp` で確定（詳細は §17）。
2. **YouTube 対応の是非:** 規約面の判断が必要。Phase 2 を実装せず「音声ファイルのみ」で Phase 1 を完結させる選択も可（Phase 1 は独立して完成する設計）。
3. ~~**既定モデル:**~~ **決定（PoC に基づく）:** 英語既定は **`ggml-small.en`**（単語一致率 95%・RTF 0.126）。低スペック時は `ggml-base.en`（93%・RTF 0.046）、精度重視は `ggml-medium.en`（97%・RTF 0.338）を `.env` で選択。日本語など他言語は `ggml-small.bin`（多言語）を使う。
4. **整形の既定値:** 「英文を整形する」を既定 ON にするか（`formatEnglishText` は大文字化・句読点補正を行うため、原文の固有名詞の大小文字が変わる可能性がある）。

---

## 17. ローカル whisper.cpp 検証結果（PoC: 2026-11-22）

**目的:** 本設計の前提（ローカル whisper.cpp で実用できるか、既定モデルはどれか）を実測で確認する。

### 17.1 検証環境

| 項目 | 内容 |
|---|---|
| CPU | Intel Core i7-11700F（8コア/16スレッド） |
| OS | Windows / PowerShell 7 |
| whisper.cpp | b5907 `whisper-bin-x64.zip`（8.7MB、CPUビルド／CUDA未使用） |
| 実行ファイル | `C:\tools\whisper.cpp\bin\Release\whisper-cli.exe`（zip 展開後の実体パス） |
| モデル | `ggml-base.en.bin`（141MB）/ `ggml-small.en.bin`（465MB）/ `ggml-medium.en.bin`（1.46GB） |
| 前処理 | ffmpeg（既存 `C:\ffmpeg\bin`）で 16kHz/mono PCM WAV に変換 |
| 評価 | 既存 `backend/src/services/comparisonService.ts` の `compare()` を ts-node で実行 |

### 17.2 実音声での精度・速度（Edgar Allan Poe "The Raven" 570.9秒 / 原典: Wikisource）

| モデル | 処理時間 | RTF（実時間比） | 単語一致率 | 文字一致率 | score |
|---|---|---|---|---|---|
| base.en | 26.3s | 0.046（約22倍速） | 93% | 97% | 94 |
| small.en | 71.8s | 0.126（約8倍速） | 95% | 98% | 96 |
| medium.en | 192.9s | 0.338（約3倍速） | 97% | 98% | 97 |

- 残差の大半は古語の現代語化（`visiter`→`visitor`, `marvelled`→`marveled`, `relevancy`→`relevance`）と固有名詞（`Pallas`→`palace`, `Plutonian`→`plutonium`）で、聞き取りミスではない。教材用途では許容範囲。
- 句読点・大文字化・数値正規化（"twenty percent"→"20%"、"three point eight million dollars"→"$3.8 million"）が自動で入る。

### 17.3 TTS音声・ノイズ耐性

| 音声 | base.en | small.en | 結果 |
|---|---|---|---|
| SAPI Zira 20.4s（通常文） | 1.02s | 2.6s | 両者とも完全一致（"twenty percent"→"20%" の正規化のみ） |
| SAPI Zira 16.2s（人名・数値・通貨） | 1.07s | 2.55s | 両者とも完全一致（`Dr. Nguyen`, `12.5%`, `$3.8 million`） |
| 上記＋ピンクノイズ | 1.10s | 2.84s | 両者とも内容一致 |


### 17.4 実音声（LibriVox 320.1秒）での挙動

| モデル | 処理時間 | RTF | セグメント数 | 語数 |
|---|---|---|---|---|
| base.en | 15.9s | 0.050 | 92 | 799 |
| small.en | 38.9s | 0.122 | 90 | 767 |
| medium.en | 110.7s | 0.346 | 53 | 752 |

- small/medium は冒頭の LibriVox 前置き（0〜27.8秒）を1文に圧縮し、内容を脱落させた。base は前置きも含めて出力。
- 脱落は「5秒超かつ4文字/秒未満」の判定で検出できた（base 0件 / small 1件 / medium 1件）。→ §7.6 の品質ガードを追加。

### 17.5 設計前提の検証結果

| 設計上の前提 | 結果 |
|---|---|
| `--print-progress` から進捗を取得できる | ○（`progress = NN%` を12回検出。設計の正規表現がそのまま使える） |
| `-oj` で JSON が出る（`<of>.json`） | ○ |
| `offsets.from/to` がミリ秒 | ○（`startTimeMs` / `endTimeMs` にそのまま格納可能） |
| セグメントが文単位で切れる | ×（句単位で切れる。例: `While I nodded, nearly`）→ 文単位統合は必須（設計どおり） |
| 無音時に幻覚を出さない | △（20秒無音 → `[BLANK_AUDIO]`。`stripNonSpeechTags` で除去可能） |
| 長い音声でも実用的な速度 | ○（5〜10分の音声を20〜90秒で処理） |

### 17.6 導入手順（PoC で実際に使用した手順）

```powershell
# 1. バイナリ（展開すると bin\Release\whisper-cli.exe が生成される）
Invoke-WebRequest https://github.com/ggml-org/whisper.cpp/releases/download/b5907/whisper-bin-x64.zip -OutFile whisper-bin-x64.zip
Expand-Archive whisper-bin-x64.zip -DestinationPath C:\tools\whisper.cpp\bin

# 2. モデル（英語: *.en / 多言語: ggml-small.bin）
Invoke-WebRequest https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin -OutFile C:\tools\whisper.cpp\models\ggml-small.en.bin

# 3. 動作確認
C:\tools\whisper.cpp\bin\Release\whisper-cli.exe -m C:\tools\whisper.cpp\models\ggml-small.en.bin -f sample.wav -l en -t 8 -oj -of out\sample --print-progress
```

- ダウンロード時間の実測: base.en（141MB）3.9秒 / small.en（465MB）11.6秒 / medium.en（1.46GB）34.3秒（回線依存）。
- CUDA ビルド（`whisper-bin-win-cuda-*.zip`）に差し替えれば GPU でさらに高速化できるが、CPU 前提でも十分と判断。

### 17.7 結論

1. **ローカル whisper.cpp は実用十分**（実音声で単語一致率93〜97%、5分音声を20〜90秒で処理）。既定プロバイダとして採用する。
2. **既定モデルは `ggml-small.en`**。速度優先なら `ggml-base.en`、精度優先なら `ggml-medium.en` を `.env` で切り替える。
3. 音声の前置き・無音は**モデルによって脱落/幻覚が起きる**ため、`[BLANK_AUDIO]` 等の除去と**低文字密度セグメントの警告**を実装に含める。
4. whisper は**句読点・大文字・数値表記を正規化**する。教材としての可読性は上がるが、原文と表記が変わる点はプレビュー編集で吸収する。

---

## 18. 実装メモ（2026-11-22 / Phase 1・2 完了）

設計からの差分と実装上の決定事項:

- **`warnings` は保存しない:** `parsedJson` は従来どおり `ImportSegment[]` のまま。低文字密度の警告は `GET /api/imports/:importId` の読み取り時に算出して返す（既存ジョブとの互換を保つため）
- **起動時の一時ファイル削除:** ジョブはインメモリ管理のため、起動時点で `AUDIO_TMP_DIR` に残っているファイルはすべて孤児として削除する（`cleanupStaleTempFiles(0)`）
- **MIME 判定の緩和:** ツールによっては `application/octet-stream` で送られるため、その場合は拡張子で判定する（`.exe` などは引き続き拒否）
- **`GET /api/imports/:importId` のレスポンス変更:** `rawText` / `parsedJson` を返さず、`segments` / `body` / `warnings` / `status` / `progress` / `durationMs` / `errorMessage` を返す（`id` と `importId` の両方を含む）
- **教材へのメタデータ保存:** 音声由来の場合、`saveImportMaterial` が `Material.sourceMetadata` に `{ mediaFileName, durationMs, sttProvider }` を自動保存する
- **YouTube（Phase 2）は未実装:** §6.2 / §7.9 は設計のみ。Phase 1 は音声ファイル単体で完結する
- **npm 依存の追加なし:** `child_process` / `fetch` / 既存 `multer` のみで実装

実装ファイル（Phase 1）:

- backend: `services/transcriptionService.ts`, `services/stt/{types,index,whisperCppProvider,openAiCompatibleProvider}.ts`, `utils/{processRunner,audioConvert,audioUpload,whisperJson}.ts`, `prisma/migrations/20261122120000_add_import_job_transcription/`
- backend tests: `whisperJson` / `audioUpload` / `processRunner` / `transcriptionService`（新規35件。既存24件と合わせて **59件すべて成功**）
- frontend: `pages/ImportAudioPage.tsx(.module.css)`, `features/imports/useTranscriptionJob.ts`, `features/imports/api.ts`, `types/index.ts`, `app/router.tsx`, `pages/MaterialsPage.tsx`

E2E 確認済み（実サーバー + 実 whisper.cpp）:

1. 20.4秒の英語音声 → 4文のセグメント（タイムスタンプ付き）に変換、進捗 0→100、`durationMs=19640`
2. 保存した教材にセグメント4件・タグ・`sourceMetadata` が入る
3. 処理中にサーバーを強制停止 → 再起動時に「Removed 2 stale audio temp file(s)」「Marked 1 interrupted import job(s) as failed」、ジョブは `failed` に確定
4. 一時ディレクトリにファイルが残らない

### 18.1 Phase 2（YouTube 取り込み）実装メモ

設計からの差分と実装上の決定事項:

- API: `POST /api/imports/youtube-audio`（JSON、202 Accepted）。`agreeToTerms: true` を必須にし、URL は YouTube ドメインの allowlist で検証（`javascript:` 等は拒否）
- yt-dlp の字幕言語は `--sub-langs "en,en-orig"`。`en.*` 指定は自動翻訳言語を大量に要求して **HTTP 429** になったため、要求言語のみに限定した
- タイトルは `--print "%(title)s"`（`--no-simulate` 併用）の標準出力から取得。`--skip-download` では info.json が生成されないため
- `YTDLP_JS_RUNTIME="node"` を設定すると `--js-runtimes node` を付与する（未指定の既定は deno のみで、環境によっては警告が出る）
- 字幕パス: VTT → `parseVtt` → `dedupeConsecutiveSegments` → completed（`sttProvider = 'youtube-subtitles'`）。STT は実行しない
- 音声パス: `-x --audio-format wav` で取得 → ffmpeg で 16kHz/mono → whisper.cpp → 文単位統合（進捗は 35〜99% にマッピング）
- 一時ファイル: ジョブ専用ディレクトリ（`AUDIO_TMP_DIR/yt-*`）を作成し、成功・失敗時に再帰削除
- フロント: `ImportAudioPage` のプレビュー部を `components/TranscriptEditor.tsx` に共通化し、新規 `ImportYoutubeAudioPage.tsx` から再利用
- 保存に使う `importId` は**完了時にも保持**する（ポーリングは `step` の切り替えで停止する）。完了時に null にすると保存できなくなるため

E2E（実サーバー + yt-dlp + whisper.cpp / `https://www.youtube.com/watch?v=jNQXAC9IVRw`）:

1. 字幕パス: タイトル「Me at the zoo」、6セグメント、`durationMs=18881`、`sttProvider='youtube-subtitles'`
2. 音声パス（`preferSubtitles:false`）: 4セグメント、`durationMs=19000`（19秒の音声を数秒で処理）
3. 教材保存: `sourceType='youtube_audio'`、`sourceUrl` 保存、`sourceMetadata={ durationMs, sttProvider }`、セグメント数一致
4. 処理後の一時ディレクトリは 0 件

テスト: backend **74件（10ファイル）成功**。frontend は `tsc -b`・`eslint`・`vite build` 成功。

既知の制約:

- YouTube 側の仕様変更・レート制限・年齢制限などで失敗することがある（その場合は yt-dlp の ERROR 行を要約して画面に表示）
- yt-dlp は更新が頻繁なため、失敗時は `python -m pip install -U yt-dlp` を案内する
- 自動字幕は句読点が乏しく、文が細かく分割されることがある（プレビューで編集可能）

---

## 付録: 変更ファイル一覧（サマリ）

**新規**
- `backend/src/services/transcriptionService.ts`
- `backend/src/services/stt/{types,index,whisperCppProvider,openAiCompatibleProvider}.ts`
- `backend/src/services/youtubeService.ts`（Phase 2）
- `backend/src/utils/{audioUpload,audioConvert,whisperJson,processRunner}.ts`
- `backend/src/__tests__/{whisperJson,audioUpload,transcriptionService}.test.ts`
- `backend/prisma/migrations/20261122120000_add_import_job_transcription/migration.sql`
- `frontend/src/pages/ImportAudioPage.tsx`, `ImportAudioPage.module.css`
- `frontend/src/features/imports/useTranscriptionJob.ts`

**変更**
- `backend/prisma/schema.prisma`（`ImportJob` に 5 カラム追加）
- `backend/src/controllers/importController.ts`, `routes/importRoutes.ts`, `server.ts`
- `backend/src/utils/httpError.ts`, `middleware/errorHandler.ts`
- `backend/.env.example`, `README.md`, `doc/design.md`
- `frontend/src/features/imports/api.ts`, `frontend/src/types/index.ts`, `frontend/src/app/router.tsx`, `frontend/src/pages/MaterialsPage.tsx`

**変更しない**
- `Material` / `MaterialSegment` スキーマ、比較アルゴリズム、練習・結果・履歴の各画面

