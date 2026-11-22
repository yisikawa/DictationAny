import prisma from '../utils/prisma';
import { parseSubtitle, segmentsToBody } from '../utils/subtitleParser';
import { detectLowDensitySegments } from '../utils/whisperJson';
import type { CreateImportInput, ImportSegment, SaveImportInput } from '../types';
import { NotFoundError } from '../utils/httpError';

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

type ImportJobRecord = NonNullable<Awaited<ReturnType<typeof getImportJob>>>;

/** parsedJson を ImportSegment[] に復元する（配列形式と { segments } 形式の両方に対応） */
export function parseSegments(parsedJson: string | null): ImportSegment[] {
  if (!parsedJson) return [];
  try {
    const parsed: unknown = JSON.parse(parsedJson);
    if (Array.isArray(parsed)) return parsed as ImportSegment[];
    if (parsed && typeof parsed === 'object') {
      const segments = (parsed as { segments?: unknown }).segments;
      if (Array.isArray(segments)) return segments as ImportSegment[];
    }
  } catch {
    // 壊れた JSON は空として扱う
  }
  return [];
}

/** GET /api/imports/:importId のレスポンス（rawText / parsedJson は返さず segments に展開する） */
export function buildImportView(job: ImportJobRecord) {
  const segments = parseSegments(job.parsedJson);
  return {
    id: job.id,
    importId: job.id,
    sourceType: job.sourceType,
    sourceUrl: job.sourceUrl,
    title: job.title ?? 'Imported',
    language: job.language,
    status: job.status,
    progress: job.progress,
    durationMs: job.durationMs,
    mediaFileName: job.mediaFileName,
    errorMessage: job.errorMessage,
    segments,
    body: segments.length > 0 ? segmentsToBody(segments) : (job.rawText ?? ''),
    warnings: detectLowDensitySegments(segments),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export async function saveImportMaterial(input: SaveImportInput) {
  const job = await prisma.importJob.findUnique({ where: { id: input.importId } });
  if (!job) throw new NotFoundError('インポートジョブが見つかりません。');

  const body = segmentsToBody(input.segments);

  // 音声取り込みの由来情報を教材側にも残す
  const metadata: Record<string, unknown> = {};
  if (job.mediaFileName) metadata.mediaFileName = job.mediaFileName;
  if (job.durationMs !== null) metadata.durationMs = job.durationMs;
  if (job.sttProvider) metadata.sttProvider = job.sttProvider;

  const material = await prisma.material.create({
    data: {
      title: input.title,
      body,
      language: input.language,
      difficulty: input.difficulty ?? null,
      tags: input.tags ? JSON.stringify(input.tags) : null,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl ?? null,
      sourceMetadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
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

