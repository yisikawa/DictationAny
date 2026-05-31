// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
import type { ImportSegment } from '../types';

/** 行がページ番号のみかどうかを判定する */
function isPageNumber(line: string): boolean {
  const trimmed = line.trim();
  // 数字のみ、または "42" / "- 42 -" / "Page 42" / "p. 42" 形式
  return /^\d+$/.test(trimmed) ||
    /^[-–—]\s*\d+\s*[-–—]$/.test(trimmed) ||
    /^[Pp]age\.?\s*\d+$/.test(trimmed) ||
    /^p\.\s*\d+$/i.test(trimmed);
}

/** 行が全大文字の見出し（タイトル・ユニット名など）かどうかを判定する */
function isAllCapsHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 80) return false;
  const letters = trimmed.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 3) return false;
  const upperCount = (letters.match(/[A-Z]/g) ?? []).length;
  // 英字の80%以上が大文字なら見出しとみなす
  return upperCount / letters.length >= 0.8;
}

/** OCRテキストの一般的なノイズを除去・補正する */
export function cleanOcrText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    // 行末ハイフンで分割された単語を結合 ("pro-\ncess" → "process")
    .replace(/(\w)-\n(\w)/g, '$1$2')
    // ページ番号・全大文字見出し行を除去
    .split('\n')
    .filter(line => !isPageNumber(line) && !isAllCapsHeading(line))
    .join('\n');
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return cleanOcrText(data.text);
}

export function pdfTextToSegments(text: string): ImportSegment[] {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(p => p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 10);

  const segments: ImportSegment[] = [];
  for (const para of paragraphs) {
    const sentences = para.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 3);
    for (const text of sentences) {
      segments.push({ text });
    }
  }
  return segments;
}
