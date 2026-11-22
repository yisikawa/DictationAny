import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { importsApi } from '../features/imports/api';
import { useTranscriptionJob } from '../features/imports/useTranscriptionJob';
import { formatEnglishText } from '../utils/formatEnglishText';
import type { ImportSegment, ImportWarning } from '../types';
import styles from './ImportNewPage.module.css';
import pdfStyles from './ImportPdfPage.module.css';
import audioStyles from './ImportAudioPage.module.css';

type Step = 'upload' | 'processing' | 'preview';
type EditableSegment = ImportSegment & { deleted?: boolean };

const MAX_MB = 100;
const AUDIO_ACCEPT = '.mp3,.m4a,.aac,.wav,.ogg,.opus,.webm,.flac,audio/*';
const AUDIO_EXT_RE = /\.(mp3|m4a|aac|wav|ogg|opus|webm|flac)$/i;

const LANGUAGES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'es-ES', label: 'Español' },
];

function formatTime(ms?: number): string {
  if (ms === undefined) return '';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function ImportAudioPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('en-US');
  const [importId, setImportId] = useState<string | null>(null);
  const [segments, setSegments] = useState<EditableSegment[]>([]);
  const [warnings, setWarnings] = useState<ImportWarning[]>([]);
  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [applyFormatting, setApplyFormatting] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const { job, error: pollError } = useTranscriptionJob(step === 'processing' ? importId : null);

  useEffect(() => {
    if (!job) return;

    if (job.status === 'completed') {
      setSegments(job.segments.map(segment => ({ ...segment })));
      setWarnings(job.warnings ?? []);
      setTitle(job.title || 'Imported');
      setImportId(null);
      setStep('preview');
    } else if (job.status === 'failed') {
      setError(job.errorMessage ?? '文字起こしに失敗しました。');
      setImportId(null);
      setStep('upload');
    }
  }, [job]);

  useEffect(() => {
    if (step !== 'processing' || startedAt === null) return;
    const timer = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step, startedAt]);

  function handleFileChange(selected: File | null) {
    if (!selected) return;
    if (!AUDIO_EXT_RE.test(selected.name) && !selected.type.startsWith('audio/')) {
      setError('対応形式は mp3 / m4a / aac / wav / ogg / opus / webm / flac です。');
      return;
    }
    if (selected.size > MAX_MB * 1024 * 1024) {
      setError(`ファイルサイズが上限(${MAX_MB}MB)を超えています。`);
      return;
    }
    setFile(selected);
    setError(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFileChange(e.dataTransfer.files[0] ?? null);
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!file || uploading) return;

    setUploading(true);
    setError(null);
    try {
      const result = await importsApi.audioPreview({ file, language });
      setImportId(result.importId);
      setTitle(result.title);
      setStartedAt(Date.now());
      setElapsedSec(0);
      setStep('processing');
    } catch (err) {
      setError(err instanceof Error ? err.message : '音声の取り込みに失敗しました');
    } finally {
      setUploading(false);
    }
  }

  function handleSegmentChange(index: number, text: string) {
    setSegments(prev => prev.map((segment, i) => (i === index ? { ...segment, text } : segment)));
  }

  function handleSegmentDelete(index: number) {
    setSegments(prev => prev.map((segment, i) => (i === index ? { ...segment, deleted: true } : segment)));
  }

  function handleSegmentRestore(index: number) {
    setSegments(prev => prev.map((segment, i) => (i === index ? { ...segment, deleted: false } : segment)));
  }

  async function handleSave() {
    if (!importId || saving) return;

    const activeSegments: ImportSegment[] = segments
      .filter(segment => !segment.deleted && segment.text.trim().length > 0)
      .map((segment) => {
        const item: ImportSegment = {
          text: applyFormatting ? formatEnglishText(segment.text) : segment.text,
        };
        if (segment.startTimeMs !== undefined) item.startTimeMs = segment.startTimeMs;
        if (segment.endTimeMs !== undefined) item.endTimeMs = segment.endTimeMs;
        return item;
      });

    if (activeSegments.length === 0) {
      setError('保存するセグメントがありません。');
      return;
    }
    if (!title.trim()) {
      setError('教材タイトルを入力してください。');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await importsApi.saveMaterial({
        importId,
        title: title.trim(),
        sourceType: 'audio_file',
        language,
        difficulty: difficulty || undefined,
        segments: activeSegments,
      });
      navigate('/materials');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setStep('upload');
    setImportId(null);
    setSegments([]);
    setWarnings([]);
    setError(null);
    setStartedAt(null);
    setElapsedSec(0);
  }

  const warningStarts = new Set(warnings.map(warning => warning.startTimeMs));
  const progress = job?.progress ?? 0;
  const processingLabel = job?.status === 'queued' ? '待機中…' : '文字起こし中…';

  return (
    <div>
      <h1 className={styles.title}>音声から取り込む</h1>
      {(error ?? pollError) && <p className={styles.error}>{error ?? pollError}</p>}

      {step === 'upload' && (
        <form className={styles.form} onSubmit={handleStart}>
          <div className={styles.field}>
            <label>音声ファイル *</label>
            <div
              className={`${pdfStyles.dropZone} ${dragging ? pdfStyles.dragging : ''} ${file ? pdfStyles.hasFile : ''}`}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              {file ? (
                <span className={pdfStyles.fileName}>
                  {file.name}（{Math.max(1, Math.round(file.size / 1024 / 1024))}MB）
                </span>
              ) : (
                <span className={pdfStyles.dropHint}>
                  クリックまたはドラッグ&ドロップで音声を選択（mp3 / m4a / wav など、最大{MAX_MB}MB）
                </span>
              )}
              <input
                type="file"
                accept={AUDIO_ACCEPT}
                className={pdfStyles.fileInput}
                onChange={e => handleFileChange(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label>言語</label>
            <select value={language} onChange={e => setLanguage(e.target.value)}>
              {LANGUAGES.map(item => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <p className={audioStyles.hint}>
              英語は English (US / UK) を選択してください。他言語はバックエンドに多言語モデル（例: ggml-small.bin）が必要です。
            </p>
          </div>

          <div className={audioStyles.actionsRow}>
            <button type="submit" className={styles.btnPrimary} disabled={uploading || !file}>
              {uploading ? '送信中…' : '文字起こし開始'}
            </button>
            <span className={audioStyles.hint}>音声は処理後にサーバーから自動削除されます。</span>
          </div>
        </form>
      )}

      {step === 'processing' && (
        <div className={audioStyles.processing}>
          <p className={audioStyles.statusLabel}>
            {processingLabel}（{Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, '0')} 経過）
          </p>
          <div className={audioStyles.progressTrack}>
            <div className={audioStyles.progressFill} style={{ width: `${Math.max(2, progress)}%` }} />
          </div>
          <p className={audioStyles.hint}>
            {progress}% 完了。長い音声では数分かかることがあります。この画面を閉じないでください。
          </p>
        </div>
      )}

      {step === 'preview' && (
        <div className={styles.preview}>
          <div className={styles.form}>
            <div className={styles.field}>
              <label>教材タイトル *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} required />
            </div>
            <div className={styles.field}>
              <label>難易度</label>
              <select value={difficulty} onChange={e => setDifficulty(e.target.value)}>
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
                onChange={e => setApplyFormatting(e.target.checked)}
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
            文字起こし結果（{segments.filter(segment => !segment.deleted).length} / {segments.length} 件）
          </h2>
          <div className={styles.segmentList}>
            {segments.map((segment, i) => (
              <div key={i} className={`${styles.segment} ${segment.deleted ? pdfStyles.segmentDeleted : ''}`}>
                <span className={styles.time}>
                  {formatTime(segment.startTimeMs)}
                  {warningStarts.has(segment.startTimeMs) ? ' ⚠' : ''}
                </span>
                <textarea
                  className={pdfStyles.segmentTextarea}
                  value={segment.text}
                  disabled={segment.deleted}
                  onChange={e => handleSegmentChange(i, e.target.value)}
                  rows={Math.max(1, Math.ceil(segment.text.length / 80))}
                />
                <div className={pdfStyles.segmentActions}>
                  {segment.deleted ? (
                    <button type="button" className={pdfStyles.btnRestore} onClick={() => handleSegmentRestore(i)}>復元</button>
                  ) : (
                    <button type="button" className={pdfStyles.btnDelete} onClick={() => handleSegmentDelete(i)}>除外</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.btnSecondary} onClick={handleReset}>別の音声を取り込む</button>
            <button type="button" className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
              {saving ? '保存中…' : '教材として保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
