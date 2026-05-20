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
