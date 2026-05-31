const SYSTEM_PROMPT = `You are an OCR text cleaner. Your only job is to fix OCR errors in English text.

CRITICAL RULES:
- This is NOT a summarization task. Do NOT summarize, shorten, or omit any content.
- Return the FULL corrected text with approximately the same length as the input.
- Do NOT write "Here is", "Here's", "Corrected:", "Note:", or any prefix/explanation.
- Do NOT respond in Japanese.
- Preserve paragraph breaks and narrative order.
- If the text is long, continue correcting the full text without stopping.

Fix only these OCR issues:
- Reconnect words split by end-of-line hyphens (e.g. "connec-\ntion" → "connection")
- Join lines broken mid-sentence due to page layout
- Fix obvious character misrecognitions (e.g. "l" misread as "1", "rn" misread as "m")
- Remove stray characters that are clearly OCR artifacts`;

// ~2000トークン相当（チャンクが小さいほどモデルが要約モードに逃げにくい）
const CHUNK_CHARS = 6000;

function splitIntoChunks(text: string): string[] {
  if (text.length <= CHUNK_CHARS) return [text];

  const chunks: string[] = [];
  let current = '';

  // 段落単位で分割し、長すぎる段落は文単位でさらに分割
  const paragraphs = text.split(/\n{2,}/);
  const units: string[] = [];
  for (const para of paragraphs) {
    if (para.length <= CHUNK_CHARS) {
      units.push(para);
    } else {
      const sentences = para.split(/(?<=[.!?])\s+/);
      units.push(...sentences);
    }
  }

  for (const unit of units) {
    const separator = current ? ' ' : '';
    const next = current + separator + unit;
    if (next.length > CHUNK_CHARS && current) {
      chunks.push(current.trim());
      current = unit;
    } else {
      current = next;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// LLMが付け加えがちな前置き・後置きを除去する
function stripLlmWrappers(text: string): string {
  return text
    .replace(/^(here'?s?\s+(is\s+)?the\s+(corrected|fixed)\s+\w*[:\-]?\s*\n?)/i, '')
    .replace(/^(corrected\s+\w+[:\-]\s*\n?)/i, '')
    .replace(/^(the\s+corrected\s+\w+\s*(is|:)[:\-]?\s*\n?)/i, '')
    .replace(/\n+note[:\-].+$/is, '')
    .replace(/\n+i\s+have\s+(corrected|fixed|made).+$/is, '')
    .trim();
}

async function correctChunk(
  baseUrl: string,
  model: string,
  chunk: string,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: chunk },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
      throw new Error('LM Studio に接続できません。LM Studio のサーバーが起動しているか確認してください。');
    }
    if (msg.includes('TimeoutError') || msg.includes('timed out')) {
      throw new Error('LM Studio からの応答がタイムアウトしました。');
    }
    throw new Error(`LM Studio エラー: ${msg}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`LM Studio がエラーを返しました (${response.status}): ${body}`);
  }

  const data = await response.json() as {
    choices: { message: { content: string } }[];
  };

  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error('LM Studio から空のレスポンスが返されました。');

  const corrected = stripLlmWrappers(raw);

  // 出力が入力の70%未満なら要約されたと判断してエラー
  if (corrected.length < chunk.length * 0.7) {
    throw new Error(
      `AI が要約して返しました（入力 ${chunk.length} 文字 → 出力 ${corrected.length} 文字）。` +
      'テキストが長すぎる可能性があります。OCR修正ボタンで前処理してから再試行してください。',
    );
  }

  return corrected;
}

export async function correctOcrWithLlm(
  text: string,
  onProgress?: (current: number, total: number) => void,
): Promise<string> {
  const baseUrl = process.env.LM_STUDIO_BASE_URL ?? 'http://localhost:1234/v1';
  const model = process.env.LM_STUDIO_MODEL ?? 'llama3.1-8b';

  const chunks = splitIntoChunks(text);
  const total = chunks.length;

  // 並列だとモデルに負荷がかかるため順番に処理
  const results: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    results.push(await correctChunk(baseUrl, model, chunks[i]));
    onProgress?.(i + 1, total);
  }

  return results.join('\n\n');
}
