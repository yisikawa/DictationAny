import prisma from '../utils/prisma';
import type { CreateMaterialInput, UpdateMaterialInput } from '../types';

export async function findAll(page: number, limit: number) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.material.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.material.count(),
  ]);
  return { items, total, page, limit };
}

export async function findById(id: string) {
  return prisma.material.findUnique({ where: { id } });
}

export async function create(input: CreateMaterialInput) {
  return prisma.material.create({
    data: {
      title: input.title,
      body: input.body,
      language: input.language,
      difficulty: input.difficulty ?? null,
      tags: input.tags ? JSON.stringify(input.tags) : null,
      sourceType: input.sourceType ?? 'manual',
      sourceUrl: input.sourceUrl ?? null,
    },
  });
}

export async function update(id: string, input: UpdateMaterialInput) {
  return prisma.material.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.body !== undefined && { body: input.body }),
      ...(input.language !== undefined && { language: input.language }),
      ...(input.difficulty !== undefined && { difficulty: input.difficulty }),
      ...(input.tags !== undefined && { tags: JSON.stringify(input.tags) }),
      ...(input.sourceType !== undefined && { sourceType: input.sourceType }),
      ...(input.sourceUrl !== undefined && { sourceUrl: input.sourceUrl }),
    },
  });
}

export async function remove(id: string) {
  return prisma.material.delete({ where: { id } });
}
