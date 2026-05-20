import type { Material } from '../generated/prisma/client';
import * as repo from '../repositories/materialRepository';
import type { CreateMaterialInput, UpdateMaterialInput } from '../types';

function parseTags(tagsJson: string | null): string[] {
  if (!tagsJson) return [];
  try { return JSON.parse(tagsJson); } catch { return []; }
}

function formatMaterial(m: Material | null) {
  if (!m) return null;
  return { ...m, tags: parseTags(m.tags) };
}

export async function listMaterials(page = 1, limit = 20) {
  const result = await repo.findAll(page, limit);
  return { ...result, items: result.items.map((m: Material) => formatMaterial(m)!) };
}

export async function getMaterial(id: string) {
  const m = await repo.findById(id);
  return formatMaterial(m);
}

export async function createMaterial(input: CreateMaterialInput) {
  const m = await repo.create(input);
  return formatMaterial(m)!;
}

export async function updateMaterial(id: string, input: UpdateMaterialInput) {
  await repo.findById(id); // throws if not found
  const m = await repo.update(id, input);
  return formatMaterial(m)!;
}

export async function deleteMaterial(id: string) {
  await repo.remove(id);
}
