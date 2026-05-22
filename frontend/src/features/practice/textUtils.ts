export function appendRecognizedText(prev: string, next: string): string {
  const text = next.trim();
  if (!text) return prev;
  if (!prev.trim()) return text;

  const lines = prev.split('\n');
  const last = lines[lines.length - 1]?.trim() ?? '';
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
  const lastNorm = normalize(last);
  const textNorm = normalize(text);

  if (lastNorm === textNorm || lastNorm.startsWith(textNorm)) return prev;
  if (textNorm.startsWith(lastNorm)) {
    lines[lines.length - 1] = text;
    return lines.join('\n');
  }

  return `${prev}\n${text}`;
}
