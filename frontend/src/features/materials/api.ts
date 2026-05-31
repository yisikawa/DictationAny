import { api } from '../../services/api';
import type { Material } from '../../types';

export interface MaterialListResponse {
  items: Material[];
  total: number;
  page: number;
  limit: number;
}

export const materialsApi = {
  list: (page = 1, limit = 20) =>
    api.get<MaterialListResponse>(`/materials?page=${page}&limit=${limit}`),
  get: (id: string) => api.get<Material>(`/materials/${id}`),
  create: (data: Omit<Material, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.post<Material>('/materials', data),
  update: (id: string, data: Partial<Omit<Material, 'id' | 'createdAt' | 'updatedAt'>>) =>
    api.put<Material>(`/materials/${id}`, data),
  delete: (id: string) => api.delete(`/materials/${id}`),
};

type OcrSseEvent =
  | { type: 'progress'; current: number; total: number }
  | { type: 'done'; correctedText: string }
  | { type: 'error'; message: string };

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

export async function correctOcrWithProgress(
  text: string,
  onProgress: (current: number, total: number) => void,
): Promise<string> {
  const response = await fetch(`${BASE}/ocr-correct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok || !response.body) {
    const json = await response.json().catch(() => ({}));
    throw new Error((json as { error?: { message?: string } }).error?.message ?? 'AI修正に失敗しました');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const event: OcrSseEvent = JSON.parse(line.slice(6));
      if (event.type === 'progress') {
        onProgress(event.current, event.total);
      } else if (event.type === 'done') {
        return event.correctedText;
      } else if (event.type === 'error') {
        throw new Error(event.message);
      }
    }
  }

  throw new Error('AI修正が完了しませんでした。');
}
