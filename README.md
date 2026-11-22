# DictationAny

英語をはじめとした任意の文章を教材にして、音声を聞きながらディクテーション練習ができる Web アプリです。

---

## 機能

- **教材管理** — テキストを直接入力して教材を登録・編集・削除
- **字幕取り込み** — YouTube / Udemy などの SRT / WebVTT 字幕から教材を作成
- **音声取り込み** — 音声ファイル（mp3 / m4a / wav など）を whisper.cpp で文字起こしして教材を作成
- **YouTube取り込み** — YouTube URL から字幕を取得、無ければ音声を文字起こしして教材を作成（yt-dlp）
- **音声読み上げ** — ブラウザの Web Speech API で教材本文を読み上げ（速度調整・文単位再生対応）
- **ディクテーション** — 聞き取った内容をテキスト入力、またはマイクで音声入力して提出
- **採点・差分表示** — 単語単位の差分ハイライト、スコア・一致率・聞き落とし単語を表示
- **練習履歴** — 過去の提出結果を一覧で確認
- **AI OCR 修正** — Ollama（`llama3.1:latest`）を使った OCR エラーの自動修正（教材編集画面）

---

## セットアップ

**前提条件:** Node.js 22 以上

```bash
# リポジトリをクローン後、依存パッケージをインストール
cd backend && npm install
cd ../frontend && npm install
```

### データベースの初期化（初回のみ）

```bash
cd backend

# 1. Prisma クライアントを生成
npx prisma generate

# 2. .env ファイルを作成（.env.example をコピーして編集）
cp .env.example .env

# 3. マイグレーションを適用して dev.db を作成
npx prisma migrate deploy
```

> **注意:** `src/generated/prisma/` が存在しない場合や `dev.db` がない場合は上記を実行してください。  
> `Cannot find module '../generated/prisma/client'` というエラーが出た場合は `npx prisma generate` の実行忘れが原因です。

---

### Ollama のセットアップ（AI OCR 修正機能）

[Ollama](https://ollama.com) をインストール後、モデルを取得してください。

```bash
ollama pull llama3.1:latest
```

`backend/.env` に接続先を設定します（デフォルトのまま変更不要）：

```dotenv
OLLAMA_BASE_URL="http://localhost:11434/v1"
OLLAMA_MODEL="llama3.1:latest"
```

---

### whisper.cpp のセットアップ（音声取り込み機能）

音声ファイルから教材を作る機能は、ローカルの [whisper.cpp](https://github.com/ggml-org/whisper.cpp) で文字起こしします（音声は外部送信されません）。**ffmpeg** も必要です。

```powershell
# 1. whisper.cpp の Windows 用バイナリを取得（展開すると bin\Release\whisper-cli.exe ができる）
New-Item -ItemType Directory -Force C:\tools\whisper.cpp\bin | Out-Null
Invoke-WebRequest https://github.com/ggml-org/whisper.cpp/releases/download/b5907/whisper-bin-x64.zip -OutFile $env:TEMP\whisper-bin-x64.zip
Expand-Archive $env:TEMP\whisper-bin-x64.zip -DestinationPath C:\tools\whisper.cpp\bin -Force

# 2. 英語モデルを取得（約465MB。軽量な ggml-base.en.bin は約141MB）
New-Item -ItemType Directory -Force C:\tools\whisper.cpp\models | Out-Null
Invoke-WebRequest https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin -OutFile C:\tools\whisper.cpp\models\ggml-small.en.bin
```

`backend/.env` に実行ファイルとモデルのパスを設定します（`backend/.env.example` に雛形があります）。

```dotenv
STT_PROVIDER="whisper-cpp"
WHISPER_CPP_BIN="C:\\tools\\whisper.cpp\\bin\\Release\\whisper-cli.exe"
WHISPER_MODEL_PATH="C:\\tools\\whisper.cpp\\models\\ggml-small.en.bin"
WHISPER_THREADS="8"
FFMPEG_PATH="ffmpeg"
```

モデルの目安（実測: 5分20秒の英語音声）:

| モデル | サイズ | 処理時間 | 単語一致率 |
|---|---|---|---|
| `ggml-base.en.bin` | 141MB | 26秒 | 93% |
| `ggml-small.en.bin`（推奨） | 465MB | 72秒 | 95% |
| `ggml-medium.en.bin` | 1.46GB | 193秒 | 97% |

日本語など他言語を扱う場合は、多言語モデル（例: `ggml-small.bin`）を指定してください。

---

### yt-dlp のセットアップ（YouTube取り込み機能）

YouTube の字幕・音声の取得には **yt-dlp** と **ffmpeg** を使用します。

```bash
# yt-dlp（Python の pip で導入する例）
python -m pip install -U yt-dlp
```

`backend/.env` の設定（既定のままで PATH が通っていれば変更不要）:

```dotenv
YTDLP_PATH="yt-dlp"
YTDLP_TIMEOUT_MS="300000"
YTDLP_JS_RUNTIME="node"
```

> **ヒント:** `YTDLP_JS_RUNTIME="node"` を設定すると、yt-dlp が Node.js を JavaScript ランタイムとして使います（未指定時は deno のみ有効）。yt-dlp は更新が頻繁なため、取得に失敗する場合は `python -m pip install -U yt-dlp` で更新してください。

---

## iPhone / iPad からアクセスする（ローカルネットワーク）

音声入力には HTTPS が必要です。同一 Wi-Fi 内の iPhone / iPad から使うには、**mkcert** でローカル信頼済み証明書を発行し、ルート CA を端末にインストールします。

### 1. mkcert をインストール（初回のみ）

```powershell
winget install FiloSottile.mkcert
```

インストール後、**ターミナルを再起動**してから以下を実行します。

```powershell
mkcert -install
```

### 2. iPhone に CA 証明書をインストール（初回のみ）

CA ファイルの場所を確認します。

```powershell
mkcert -CAROOT
# 例: C:\Users\yourname\AppData\Local\mkcert
```

表示されたフォルダ内の `rootCA.pem` を iPhone に転送します（メール・LINE・iCloud Drive など）。

> **注意:** フロントエンドの開発サーバーが LAN の IP アドレスにバインドされていない場合、同一 Wi-Fi 内の他端末からはアクセスできません。`frontend/.env.local`（Git 管理外）に `VITE_DEV_HOST="<PCのIPアドレス>"` を設定してください。未設定時は `localhost` にバインドされます。

iPhone での操作：

1. 転送したファイルを開く →「プロファイルがダウンロードされました」と表示
2. **設定 → 一般 → VPN とデバイス管理** → ダウンロード済みプロファイル → インストール
3. **設定 → 一般 → 情報 → 証明書信頼設定** → `mkcert ...` のスイッチをオン

### 3. アクセス

PC の IP アドレスを確認して Safari でアクセスします。

```
https://<PCのIPアドレス>:5160
```

> **注意:** iPhone Chrome / Firefox では音声入力の Web Speech API が利用できません。**Safari** をご利用ください。

---

## 起動方法

### バッチファイルで起動（Windows）

| ファイル | 動作 |
|---|---|
| `start.bat` | バックエンドとフロントエンドを別ウィンドウで同時起動し、ブラウザを自動オープン |
| `start-backend.bat` | バックエンドのみ起動 |
| `start-frontend.bat` | フロントエンドのみ起動 |

通常は `start.bat` をダブルクリックするだけで起動できます。

### コマンドで起動

ターミナルを 2 つ開いて、それぞれ実行してください。

**バックエンド（ターミナル 1）**

```bash
cd backend
npm run dev
```

`http://localhost:3000` で起動します。

**フロントエンド（ターミナル 2）**

```bash
cd frontend
npm run dev
```

既定では `https://localhost:5160` で起動します。`frontend/.env.local` に `VITE_DEV_HOST` を設定している場合はそのホスト（例: `https://192.168.111.10:5160`）で開きます。

---

## 使い方

### 1. 教材を登録する

**テキストを直接入力する場合**

1. ヘッダーの「教材」をクリック
2. 「+ 新規教材」ボタンをクリック
3. タイトル・本文・言語などを入力して「作成」

**字幕ファイルから取り込む場合**

1. 「教材」→「字幕から取り込む」をクリック
2. 取り込み元（YouTube / Udemy など）と言語を選択
3. SRT または WebVTT 形式の字幕テキストを貼り付け
4. 利用規約への同意にチェックを入れて「プレビュー」
5. 字幕の内容を確認し、タイトルを設定して「教材として保存」

**PDF ファイルから取り込む場合**

1. 「教材」→「PDFから取り込む」をクリック
2. PDF ファイルをクリックまたはドラッグ&ドロップで選択
3. 言語を選択して「プレビュー」
4. 抽出されたテキストを確認し、タイトル・難易度を設定して「教材として保存」

> **注意:** スキャン画像の PDF（OCR 処理されていないもの）はテキスト抽出できません。テキストレイヤーを含む PDF が対象です。

**音声ファイルから取り込む場合**

1. 「教材」→「音声から取り込む」をクリック
2. 音声ファイル（mp3 / m4a / wav / ogg / webm / flac など、最大100MB）を選択
3. 言語（英語なら English (US / UK)）を選んで「文字起こし開始」
4. 進捗が 100% になるまで待つ（5分の音声で1〜2分程度）
5. 文字起こし結果を確認し、不要な行を「除外」、誤りを直接修正
6. タイトル・難易度を設定して「教材として保存」

> **ヒント:** 認識が不完全な可能性がある区間には ⚠ が表示されます。また「英文を整形する」をオンにすると、大文字・句読点・単語間スペースが補正されます。音声ファイルは処理後にサーバーから自動削除されます。

**YouTubeから取り込む場合**

1. 「教材」→「YouTubeから取り込む」をクリック
2. YouTube の URL（`https://www.youtube.com/watch?v=...` または `https://youtu.be/...`）を入力
3. 言語と「字幕があれば字幕から取り込む」を選択
4. 「利用権限を有するコンテンツのみ取り込む」にチェックして「取り込み開始」
5. 進捗が 100% になるまで待つ（字幕があれば数秒、無ければ音声の長さに応じて数分）
6. 文字起こし結果を確認・修正して「教材として保存」

> **注意:** 取り込めるのは利用権限を有するコンテンツに限ります。YouTube の利用規約に従ってご利用ください。ダウンロードした音声は処理後に自動削除されます。
>
> **ヒント:** 自動字幕は同じ内容を繰り返す形式（ローリング字幕）で提供されますが、取り込み時に重複を自動除去して文単位に整形します。

---

### 2. 練習する

1. 教材一覧から教材を選び「練習する」をクリック
2. 音声操作バーの「▶ 再生」で読み上げを開始
   - **再生速度**: 0.5x / 0.75x / 1.0x / 1.25x から選択
   - **文単位再生**: 各文の「▷」ボタンで 1 文だけ再生
3. 聞き取った内容をテキストエリアに入力、またはマイク入力を使用
   - **🎤 録音** ボタンを押してマイクに向かって話すと、音声がテキストに自動変換される（PC: Chrome / Edge、iPhone: Safari）
   - 文が確定するたびに改行区切りで追記される
   - **🔍 マイクテスト** ボタンでマイクの音量レベルを確認できる
4. **表示モード**の切り替え
   - **Practice** — 原文を表示しながら練習
   - **Blind** — 原文を隠して練習
5. 「提出して採点」をクリック

---

### 3. 結果を確認する

採点結果画面では以下を確認できます。

| 表示項目 | 内容 |
|---|---|
| スコア | 単語一致率 70% + 文字一致率 30% の加重平均 |
| 単語一致率 | 正しく聞き取れた単語の割合 |
| 文字一致率 | 文字レベルの一致度（Levenshtein 距離ベース） |
| 差分ハイライト | 赤 = 聞き落とし、黄 = 余分な単語 |
| スペルミス候補 | 原文の単語と入力単語の対応 |

「再挑戦」ボタンで同じ教材をもう一度練習できます。

---

### 4. 履歴を確認する

ヘッダーの「履歴」から過去の練習結果一覧を表示できます。各行の「詳細」から採点結果画面へ戻れます。

---

## テスト

**バックエンド**

```bash
cd backend
npm test
```

比較ロジック（LCS diff・スコア計算）と字幕パーサーのユニットテストが実行されます。

**フロントエンド**

```bash
cd frontend
npm test
```

英文成型ロジックなどのユニットテストが実行されます。

---

## プロジェクト構成

```
DictationAny/
  doc/              # 企画書・設計書
  frontend/         # Vite + React + TypeScript
    src/
      app/          # ルーター定義
      components/   # 共通 UI コンポーネント
      features/     # 機能単位の API・hooks
      pages/        # 画面コンポーネント
      services/     # API クライアント
  backend/          # Node.js + Express + TypeScript
    src/
      controllers/  # リクエストハンドラー
      services/     # ビジネスロジック
      stt/          # 文字起こしプロバイダ（whisper.cpp / OpenAI互換）
      repositories/ # DB アクセス
      utils/        # diff・パーサーなどユーティリティ
      __tests__/    # ユニットテスト
    prisma/         # スキーマ・マイグレーション
```

## 技術スタック

| 領域 | 使用技術 |
|---|---|
| フロントエンド | React / TypeScript / Vite / React Router |
| バックエンド | Node.js / Express / TypeScript |
| データベース | SQLite（Prisma 7） |
| 音声読み上げ | Web Speech API (SpeechSynthesis) |
| 音声入力 | Web Speech API (SpeechRecognition) — Chrome / Edge / iOS Safari |
| 音声認識（音声取り込み） | whisper.cpp（ローカル） / OpenAI 互換 STT API |
| YouTube取り込み | yt-dlp（字幕優先 → 音声は whisper.cpp で文字起こし） |
| 比較アルゴリズム | LCS diff + Levenshtein 距離 |
| AI OCR 修正 | Ollama (`llama3.1:latest`) — OpenAI 互換 API |
