import { api } from '../../services/api';
import type {
  AudioImportResponse,
  ImportJobResponse,
  ImportPreviewResponse,
  Material,
} from '../../types';

export interface ImportPreviewInput {
  sourceType: string;
  sourceUrl?: string;
  language: string;
  subtitleText: string;
  subtitleFormat: string;
  title?: string;
}

export interface ImportSaveInput {
  importId: string;
  title: string;
  sourceType: string;
  sourceUrl?: string;
  language: string;
  difficulty?: string;
  tags?: string[];
  segments: { startTimeMs?: number; endTimeMs?: number; text: string }[];
}

export interface ImportPdfPreviewInput {
  file: File;
  language: string;
  title?: string;
}

export interface AudioImportInput {
  file: File;
  language: string;
  title?: string;
}

export interface YoutubeAudioImportInput {
  sourceUrl: string;
  language: string;
  preferSubtitles: boolean;
  agreeToTerms: boolean;
}

export const importsApi = {
  preview: (data: ImportPreviewInput) =>
    api.post<ImportPreviewResponse>('/imports/preview', data),
  pdfPreview: (data: ImportPdfPreviewInput) => {
    const fd = new FormData();
    fd.append('file', data.file);
    fd.append('language', data.language);
    if (data.title) fd.append('title', data.title);
    return api.postFile<ImportPreviewResponse>('/imports/pdf/preview', fd);
  },
  /** 音声ファイルの文字起こしを開始する（202 で importId が返る） */
  audioPreview: (data: AudioImportInput) => {
    const fd = new FormData();
    fd.append('file', data.file);
    fd.append('language', data.language);
    if (data.title) fd.append('title', data.title);
    return api.postFile<AudioImportResponse>('/imports/audio', fd);
  },
  /** 文字起こしジョブの状態・結果を取得する */
  getJob: (importId: string) => api.get<ImportJobResponse>(`/imports/${importId}`),
  /** YouTube URL からの取り込みを開始する（202 で importId が返る） */
  youtubeAudioPreview: (data: YoutubeAudioImportInput) =>
    api.post<AudioImportResponse>('/imports/youtube-audio', data),
  saveMaterial: (data: ImportSaveInput) =>
    api.post<Material>('/imports/materials', data),
};
