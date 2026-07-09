import nlp from 'compromise'

const OCR_FIXES: Array<[RegExp, string]> = [
  // Unicode ligatures from PDF/OCR scanning
  [/ﬁ/g, 'fi'],
  [/ﬂ/g, 'fl'],
  [/ﬀ/g, 'ff'],
  [/ﬃ/g, 'ffi'],
  [/ﬄ/g, 'ffl'],
  // Curly/smart quotes → straight ASCII
  [/['']/g, "'"],
  [/[""]/g, '"'],
  // Digit-letter confusion in numeric context (e.g. "2l3" → "213", "2O3" → "203")
  [/(\d)l(\d)/g, '$11$2'],
  [/(\d)O(\d)/g, '$10$2'],
  // Capital I mistaken as L by OCR — 誤爆を避けるため文脈を限定する
  [/\bLt\b/g, 'It'],
  [/\bL(?='[a-z])/g, 'I'],
  [/\bL\b(?=\s+(?:am|was|will|would|have|had|can|could|do|did|don't|didn't|think|know|want|went|got)\b)/g, 'I'],
]

// 文間スペース補完: 「小文字2文字+終端記号」の直後に大文字が続く場合のみ。
// U.S. / e.g. / example.com のような略語・URLには反応しない。
const SENTENCE_GAP_RE = /([a-z]{2}[.!?])(?=[A-Z])/g

export function formatEnglishText(text: string): string {
  // Split on paragraph breaks, preserving the separators
  const segments = text.split(/(\n{2,})/)

  return segments
    .map(segment => {
      if (/^\n+$/.test(segment)) return segment

      let result = segment

      for (const [pat, rep] of OCR_FIXES) {
        result = result.replace(pat, rep)
      }

      result = result
        .replace(/\s+([,;:!?.])/g, '$1')
        .replace(SENTENCE_GAP_RE, '$1 ')
        .replace(/[ \t]{2,}/g, ' ')

      // Capitalize first word of each sentence using NLP sentence boundary detection
      const doc = nlp(result)
      doc.sentences().forEach(s => {
        s.terms().first().toTitleCase()
      })

      return doc.text()
    })
    .join('')
}

export function countFormattingIssues(text: string): number {
  let count = 0

  for (const [pat] of OCR_FIXES) {
    count += (text.match(pat) ?? []).length
  }

  // Spacing issues fixed by formatEnglishText
  count += (text.match(/\s+[,;:!?.]/g) ?? []).length
  count += (text.match(/[a-z]{2}[.!?](?=[A-Z])/g) ?? []).length
  count += (text.match(/[ \t]{2,}/g) ?? []).length

  const doc = nlp(text)
  doc.sentences().forEach(s => {
    const t = s.text().trimStart()
    if (/^[a-z]/.test(t)) count++
  })

  return count
}
