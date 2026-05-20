export interface Material {
  id: string;
  title: string;
  body: string;
  language: string;
  difficulty: string | null;
  tags: string | null;
  sourceType: string;
  sourceUrl: string | null;
  sourceMetadata: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMaterialInput {
  title: string;
  body: string;
  language: string;
  difficulty?: string;
  tags?: string[];
  sourceType?: string;
  sourceUrl?: string;
}

export interface UpdateMaterialInput extends Partial<CreateMaterialInput> {}

export interface ImportSegment {
  startTimeMs?: number;
  endTimeMs?: number;
  text: string;
}

export interface CreateImportInput {
  sourceType: string;
  sourceUrl?: string;
  language: string;
  subtitleText?: string;
  subtitleFormat?: string;
  title?: string;
}

export interface SaveImportInput {
  importId: string;
  title: string;
  sourceType: string;
  sourceUrl?: string;
  language: string;
  difficulty?: string;
  tags?: string[];
  segments: ImportSegment[];
}

export interface CompareOptions {
  caseSensitive?: boolean;
  ignorePunctuation?: boolean;
  normalizeWhitespace?: boolean;
}

export interface CompareInput {
  originalText: string;
  submittedText: string;
  options?: CompareOptions;
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

export interface CreateAttemptInput {
  materialId: string;
  submittedText: string;
  options?: CompareOptions;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
