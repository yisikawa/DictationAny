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
  // Capital I mistaken as L by OCR (e.g. "Lt" → "It", "Lt's" → "It's", "L'm" → "I'm")
  [/\bLt\b/g, 'It'],
  [/\bLt'/g, "It'"],
  [/\bL(?='[a-z])/g, 'I'],
  [/\bL\b/g, 'I'],
]

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
        .replace(/([.!?])([A-Za-z])/g, '$1 $2')
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
  count += (text.match(/[.!?][A-Za-z]/g) ?? []).length
  count += (text.match(/[ \t]{2,}/g) ?? []).length

  const doc = nlp(text)
  doc.sentences().forEach(s => {
    const t = s.text().trimStart()
    if (/^[a-z]/.test(t)) count++
  })

  return count
}
