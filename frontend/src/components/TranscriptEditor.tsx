import {
  formatSegmentTime,
  type EditableSegment,
} from '../features/imports/transcriptDraft';
import type { ImportWarning } from '../types';
import styles from '../pages/ImportNewPage.module.css';
import pdfStyles from '../pages/ImportPdfPage.module.css';
import audioStyles from '../pages/ImportAudioPage.module.css';

export interface TranscriptEditorProps {
  segments: EditableSegment[];
  warnings: ImportWarning[];
  title: string;
  difficulty: string;
  applyFormatting: boolean;
  saving: boolean;
  savingLabel?: string;
  resetLabel: string;
  onTitleChange: (value: string) => void;
  onDifficultyChange: (value: string) => void;
  onApplyFormattingChange: (value: boolean) => void;
  onSegmentChange: (index: number, text: string) => void;
  onSegmentDelete: (index: number) => void;
  onSegmentRestore: (index: number) => void;
  onSave: () => void;
  onReset: () => void;
}

export default function TranscriptEditor(props: TranscriptEditorProps) {
  const {
    segments,
    warnings,
    title,
    difficulty,
    applyFormatting,
    saving,
    savingLabel = '保存中…',
    resetLabel,
    onTitleChange,
    onDifficultyChange,
    onApplyFormattingChange,
    onSegmentChange,
    onSegmentDelete,
    onSegmentRestore,
    onSave,
    onReset,
  } = props;

  const warningStarts = new Set(warnings.map(warning => warning.startTimeMs));
  const activeCount = segments.filter(segment => !segment.deleted).length;

  return (
    <div className={styles.preview}>
      <div className={styles.form}>
        <div className={styles.field}>
          <label>教材タイトル *</label>
          <input value={title} onChange={e => onTitleChange(e.target.value)} required />
        </div>
        <div className={styles.field}>
          <label>難易度</label>
          <select value={difficulty} onChange={e => onDifficultyChange(e.target.value)}>
            <option value="">未設定</option>
            <option value="beginner">初級</option>
            <option value="intermediate">中級</option>
            <option value="advanced">上級</option>
          </select>
        </div>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={applyFormatting}
            onChange={e => onApplyFormattingChange(e.target.checked)}
          />
          英文を整形する（大文字・句読点・単語間スペースを補正）
        </label>
      </div>

      {warnings.length > 0 && (
        <p className={audioStyles.warning}>
          {warnings.length} 件の区間で認識が不完全な可能性があります。⚠ の行を確認してください。
        </p>
      )}

      <h2 className={styles.sectionTitle}>
        文字起こし結果（{activeCount} / {segments.length} 件）
      </h2>
      <div className={styles.segmentList}>
        {segments.map((segment, i) => (
          <div key={i} className={`${styles.segment} ${segment.deleted ? pdfStyles.segmentDeleted : ''}`}>
            <span className={styles.time}>
              {formatSegmentTime(segment.startTimeMs)}
              {warningStarts.has(segment.startTimeMs) ? ' ⚠' : ''}
            </span>
            <textarea
              className={pdfStyles.segmentTextarea}
              value={segment.text}
              disabled={segment.deleted}
              onChange={e => onSegmentChange(i, e.target.value)}
              rows={Math.max(1, Math.ceil(segment.text.length / 80))}
            />
            <div className={pdfStyles.segmentActions}>
              {segment.deleted ? (
                <button type="button" className={pdfStyles.btnRestore} onClick={() => onSegmentRestore(i)}>復元</button>
              ) : (
                <button type="button" className={pdfStyles.btnDelete} onClick={() => onSegmentDelete(i)}>除外</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.btnSecondary} onClick={onReset}>{resetLabel}</button>
        <button type="button" className={styles.btnPrimary} onClick={onSave} disabled={saving}>
          {saving ? savingLabel : '教材として保存'}
        </button>
      </div>
    </div>
  );
}
