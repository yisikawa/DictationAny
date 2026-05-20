import type { CompareOptions } from '../types';

const PUNCT_RE = /[^\w\s]/g;

export function normalize(text: string, opts: Required<CompareOptions>): string {
  let t = text;
  if (!opts.caseSensitive) t = t.toLowerCase();
  if (opts.ignorePunctuation) t = t.replace(PUNCT_RE, '');
  if (opts.normalizeWhitespace) t = t.replace(/\s+/g, ' ').trim();
  return t;
}

export function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}
