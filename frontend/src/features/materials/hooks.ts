import { useAsyncResource } from '../../hooks/useAsyncResource';
import { materialsApi, type MaterialListResponse } from './api';
import type { Material } from '../../types';

export function useMaterials(page = 1) {
  const { data, loading, error, reload } = useAsyncResource<MaterialListResponse>(
    () => materialsApi.list(page),
    [page],
  );
  return { data, loading, error, reload };
}

export function useMaterial(id: string) {
  const { data: material, loading, error } = useAsyncResource<Material>(
    () => materialsApi.get(id),
    [id],
  );
  return { material, loading, error };
}
