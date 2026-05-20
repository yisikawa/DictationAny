import { api } from '../../services/api';
import type { ImportPreviewResponse, Material } from '../../types';

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
  saveMaterial: (data: ImportSaveInput) =>
    api.post<Material>('/imports/materials', data),
};
