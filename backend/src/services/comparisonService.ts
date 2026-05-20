import type { CompareInput, CompareResult, CompareOptions } from '../types';
import { normalize, tokenize } from '../utils/normalizeText';
import { diffWords, levenshtein } from '../utils/diffText';

const DEFAULT_OPTS: Required<CompareOptions> = {
  caseSensitive: false,
  ignorePunctuation: true,
  normalizeWhitespace: true,
};

export function compare(input: CompareInput): CompareResult {
  const opts: Required<CompareOptions> = { ...DEFAULT_OPTS, ...input.options };

  const normOrig = normalize(input.originalText, opts);
  const normSub  = normalize(input.submittedText, opts);

  const origWords = tokenize(normOrig);
  const subWords  = tokenize(normSub);

  const diff = diffWords(origWords, subWords);

  const matchedCount = diff.filter(d => d.type === 'equal').length;
  const wordAccuracy = origWords.length === 0 ? 100
    : Math.round(matchedCount / origWords.length * 100);

  const dist = levenshtein(normOrig, normSub);
  const charAccuracy = normOrig.length === 0 ? 100
    : Math.round(Math.max(0, 1 - dist / normOrig.length) * 100);

  const score = Math.round(wordAccuracy * 0.7 + charAccuracy * 0.3);

  const missingWords = diff.filter(d => d.type === 'missing').map(d => d.text!);
  const extraWords   = diff.filter(d => d.type === 'extra').map(d => d.text!);
  const possibleSpellingErrors = diff
    .filter(d => d.type === 'replace')
    .map(d => ({ expected: d.expected!, actual: d.actual! }));

  return { score, wordAccuracy, characterAccuracy: charAccuracy, missingWords, extraWords, possibleSpellingErrors, diff };
}
