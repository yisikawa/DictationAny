import prisma from '../utils/prisma';
import type { CreateAttemptInput } from '../types';
import { compare } from '../services/comparisonService';

type AttemptRow = Awaited<ReturnType<typeof prisma.attempt.findUniqueOrThrow>>;

export function toAttemptResponse(raw: AttemptRow) {
  return { ...raw, result: JSON.parse(raw.resultJson) };
}

export async function findByMaterial(materialId: string) {
  return prisma.attempt.findMany({
    where: { materialId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function findAll() {
  return prisma.attempt.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function findById(id: string) {
  return prisma.attempt.findUnique({ where: { id } });
}

export async function create(input: CreateAttemptInput) {
  const material = await prisma.material.findUnique({ where: { id: input.materialId } });
  if (!material) throw new Error('Material not found');

  const result = compare({
    originalText: material.body,
    submittedText: input.submittedText,
    options: input.options,
  });

  return prisma.attempt.create({
    data: {
      materialId: input.materialId,
      submittedText: input.submittedText,
      score: result.score,
      wordAccuracy: result.wordAccuracy,
      characterAccuracy: result.characterAccuracy,
      resultJson: JSON.stringify(result),
    },
  });
}
