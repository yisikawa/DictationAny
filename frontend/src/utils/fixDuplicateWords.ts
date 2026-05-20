/**
 * 同一行内で連続する重複単語を除去する。
 * 例: "I I want to to go" → "I want to go"
 * 改行は保持する。大文字小文字は無視して比較する。
 */
export function fixDuplicateWords(text: string): string {
  return text
    .split('\n')
    .map(line => line.replace(/\b(\w+)([ \t]+\1)+\b/gi, '$1'))
    .join('\n');
}

export function countDuplicates(text: string): number {
  let count = 0;
  text.split('\n').forEach(line => {
    const matches = line.match(/\b(\w+)([ \t]+\1)+\b/gi);
    if (matches) count += matches.length;
  });
  return count;
}
