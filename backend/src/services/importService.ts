import prisma from '../utils/prisma';
import { parseSubtitle, segmentsToBody } from '../utils/subtitleParser';
import type { CreateImportInput, SaveImportInput } from '../types';

export async function previewImport(input: CreateImportInput) {
  const format = input.subtitleFormat ?? 'plain';
  const rawText = input.subtitleText ?? '';
  const segments = parseSubtitle(rawText, format);
  const body = segmentsToBody(segments);

  const job = await prisma.importJob.create({
    data: {
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl ?? null,
      title: input.title ?? null,
      language: input.language,
      status: 'preview',
      rawText,
      parsedJson: JSON.stringify(segments),
    },
  });

  return {
    importId: job.id,
    sourceType: job.sourceType,
    sourceUrl: job.sourceUrl,
    title: job.title ?? input.title ?? 'Imported',
    language: job.language,
    segments,
    body,
  };
}

export async function getImportJob(id: string) {
  return prisma.importJob.findUnique({ where: { id } });
}

export async function saveImportMaterial(input: SaveImportInput) {
  const job = await prisma.importJob.findUnique({ where: { id: input.importId } });
  if (!job) throw new Error('ImportJob not found');

  const body = segmentsToBody(input.segments);

  const material = await prisma.material.create({
    data: {
      title: input.title,
      body,
      language: input.language,
      difficulty: input.difficulty ?? null,
      tags: input.tags ? JSON.stringify(input.tags) : null,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl ?? null,
      segments: {
        create: input.segments.map((seg, i) => ({
          startTimeMs: seg.startTimeMs ?? null,
          endTimeMs: seg.endTimeMs ?? null,
          text: seg.text,
          orderIndex: i,
        })),
      },
    },
  });

  await prisma.importJob.update({
    where: { id: input.importId },
    data: { status: 'completed', materialId: material.id },
  });

  return material;
}
