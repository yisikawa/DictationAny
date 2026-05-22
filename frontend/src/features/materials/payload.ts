import type { MaterialFormValues } from '../../components/MaterialForm';

export function toMaterialPayload(values: MaterialFormValues) {
  return {
    title: values.title,
    body: values.body,
    language: values.language,
    difficulty: values.difficulty || undefined,
    tags: values.tags.split(',').map(t => t.trim()).filter(Boolean),
    sourceUrl: values.sourceUrl || undefined,
  };
}
