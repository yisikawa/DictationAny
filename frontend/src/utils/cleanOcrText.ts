function isPageNumber(line: string): boolean {
  const t = line.trim();
  return /^\d+$/.test(t) ||
    /^[-–—]\s*\d+\s*[-–—]$/.test(t) ||
    /^[Pp]age\.?\s*\d+$/.test(t) ||
    /^p\.\s*\d+$/i.test(t);
}

function isAllCapsHeading(line: string): boolean {
  const t = line.trim();
  if (t.length === 0 || t.length > 80) return false;
  const letters = t.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 3) return false;
  const upperCount = (letters.match(/[A-Z]/g) ?? []).length;
  return upperCount / letters.length >= 0.8;
}

export function cleanOcrText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/(\w)-\n(\w)/g, '$1$2')
    .split('\n')
    .filter(line => !isPageNumber(line) && !isAllCapsHeading(line))
    .join('\n')
    .replace(/(?<!\n)\n(?!\n)/g, ' ')
    .replace(/[ \t]{2,}/g, ' ');
}

export function countOcrIssues(text: string): number {
  const hyphenBreaks = (text.match(/(\w)-\n(\w)/g) ?? []).length;
  const singleNewlines = (text.match(/(?<!\n)\n(?!\n)/g) ?? []).length;
  const pageNumbers = text.split('\n').filter(isPageNumber).length;
  const capsHeadings = text.split('\n').filter(isAllCapsHeading).length;
  return hyphenBreaks + singleNewlines + pageNumbers + capsHeadings;
}
