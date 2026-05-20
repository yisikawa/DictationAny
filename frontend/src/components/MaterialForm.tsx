import { useState } from 'react';
import type { Material } from '../types';
import { fixDuplicateWords, countDuplicates } from '../utils/fixDuplicateWords';
import styles from './MaterialForm.module.css';

export interface MaterialFormValues {
  title: string;
  body: string;
  language: string;
  difficulty: string;
  tags: string;
  sourceUrl: string;
}

interface Props {
  initial?: Partial<Material>;
  onSubmit: (values: MaterialFormValues) => Promise<void>;
  submitLabel?: string;
}

export default function MaterialForm({ initial, onSubmit, submitLabel = '保存' }: Props) {
  const [values, setValues] = useState<MaterialFormValues>({
    title: initial?.title ?? '',
    body: initial?.body ?? '',
    language: initial?.language ?? 'en-US',
    difficulty: initial?.difficulty ?? '',
    tags: initial?.tags?.join(', ') ?? '',
    sourceUrl: initial?.sourceUrl ?? '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixedCount, setFixedCount] = useState<number | null>(null);

  function handleFixDuplicates() {
    const count = countDuplicates(values.body);
    const fixed = fixDuplicateWords(values.body);
    setValues(v => ({ ...v, body: fixed }));
    setFixedCount(count);
  }

  function set(key: keyof MaterialFormValues) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setValues(v => ({ ...v, [key]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.field}>
        <label>タイトル *</label>
        <input value={values.title} onChange={set('title')} required maxLength={120} />
      </div>
      <div className={styles.field}>
        <div className={styles.labelRow}>
          <label>本文 *</label>
          <button type="button" className={styles.btnFix} onClick={handleFixDuplicates}>
            重複単語を修正
          </button>
        </div>
        {fixedCount !== null && (
          <p className={fixedCount > 0 ? styles.fixSuccess : styles.fixNone}>
            {fixedCount > 0 ? `${fixedCount} 件の重複単語を修正しました` : '重複単語はありませんでした'}
          </p>
        )}
        <textarea value={values.body} onChange={e => { setFixedCount(null); set('body')(e); }} required rows={8} />
      </div>
      <div className={styles.row}>
        <div className={styles.field}>
          <label>言語</label>
          <select value={values.language} onChange={set('language')}>
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="ja-JP">日本語</option>
            <option value="fr-FR">Français</option>
            <option value="de-DE">Deutsch</option>
            <option value="es-ES">Español</option>
          </select>
        </div>
        <div className={styles.field}>
          <label>難易度</label>
          <select value={values.difficulty} onChange={set('difficulty')}>
            <option value="">未設定</option>
            <option value="beginner">初級</option>
            <option value="intermediate">中級</option>
            <option value="advanced">上級</option>
          </select>
        </div>
      </div>
      <div className={styles.field}>
        <label>タグ（カンマ区切り）</label>
        <input value={values.tags} onChange={set('tags')} placeholder="news, business" />
      </div>
      <div className={styles.field}>
        <label>取り込み元 URL</label>
        <input value={values.sourceUrl} onChange={set('sourceUrl')} type="url" placeholder="https://..." />
      </div>
      <div className={styles.footer}>
        <button type="submit" className={styles.btnSubmit} disabled={submitting}>
          {submitting ? '保存中…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
