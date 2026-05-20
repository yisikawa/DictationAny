import { api } from '../../services/api';
import type { Attempt, CompareOptions, CompareResult } from '../../types';

export interface AttemptDetail extends Attempt {
  result: CompareResult;
}

export const attemptsApi = {
  list: (materialId?: string) =>
    api.get<Attempt[]>(materialId ? `/attempts?materialId=${materialId}` : '/attempts'),
  get: (id: string) => api.get<AttemptDetail>(`/attempts/${id}`),
  create: (materialId: string, submittedText: string, options?: CompareOptions) =>
    api.post<AttemptDetail>('/attempts', { materialId, submittedText, options }),
};
