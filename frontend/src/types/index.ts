export interface Material {
  id: string;
  title: string;
  body: string;
  language: string;
  difficulty?: string;
  tags?: string[];
  sourceType: string;
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialSegment {
  id: string;
  materialId: string;
  startTimeMs?: number;
  endTimeMs?: number;
  text: string;
  orderIndex: number;
}

export interface ImportSegment {
  startTimeMs?: number;
  endTimeMs?: number;
  text: string;
}

export interface ImportPreviewResponse {
  importId: string;
  sourceType: string;
  sourceUrl?: string;
  title: string;
  language: string;
  segments: ImportSegment[];
  body: string;
}

export interface Attempt {
  id: string;
  materialId: string;
  submittedText: string;
  score: number;
  wordAccuracy: number;
  characterAccuracy: number;
  createdAt: string;
}

export type DiffType = 'equal' | 'missing' | 'extra' | 'replace';

export interface DiffToken {
  type: DiffType;
  text?: string;
  expected?: string;
  actual?: string;
}

export interface CompareResult {
  score: number;
  wordAccuracy: number;
  characterAccuracy: number;
  missingWords: string[];
  extraWords: string[];
  possibleSpellingErrors: { expected: string; actual: string }[];
  diff: DiffToken[];
}

export interface CompareOptions {
  caseSensitive: boolean;
  ignorePunctuation: boolean;
  normalizeWhitespace: boolean;
}

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
