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

export const importsApi = {
  preview: (data: ImportPreviewInput) =>
    api.post<ImportPreviewResponse>('/imports/preview', data),
  saveMaterial: (data: ImportSaveInput) =>
    api.post<Material>('/imports/materials', data),
};
