import { useState, useEffect, useCallback } from 'react';
import { materialsApi, type MaterialListResponse } from './api';
import type { Material } from '../../types';

export function useMaterials(page = 1) {
  const [data, setData] = useState<MaterialListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await materialsApi.list(page);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load materials');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}

export function useMaterial(id: string) {
  const [material, setMaterial] = useState<Material | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    materialsApi.get(id)
      .then(setMaterial)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  return { material, loading, error };
}
