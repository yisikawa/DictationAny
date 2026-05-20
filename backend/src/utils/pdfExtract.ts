// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
import type { ImportSegment } from '../types';

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text;
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
