import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TranscriptEditor from '../components/TranscriptEditor';
import {
  toSavableSegments,
  type EditableSegment,
} from '../features/imports/transcriptDraft';
import { importsApi } from '../features/imports/api';
import { useTranscriptionJob } from '../features/imports/useTranscriptionJob';
import type { ImportWarning } from '../types';
import styles from './ImportNewPage.module.css';
import audioStyles from './ImportAudioPage.module.css';

type Step = 'input' | 'processing' | 'preview';

const LANGUAGES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'es-ES', label: 'Español' },
];

/** 明らかに YouTube ではない入力をクライアント側で弾く（最終判定はサーバー） */
function isLikelyYoutubeUrl(value: string): boolean {
  return /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)/i
    .test(value.trim());
}

export default function ImportYoutubeAudioPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('input');
  const [sourceUrl, setSourceUrl] = useState('');
  const [language, setLanguage] = useState('en-US');
  const [preferSubtitles, setPreferSubtitles] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [importId, setImportId] = useState<string | null>(null);
  const [segments, setSegments] = useState<EditableSegment[]>([]);
  const [warnings, setWarnings] = useState<ImportWarning[]>([]);
  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [applyFormatting, setApplyFormatting] = useState(true);
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const { job, error: pollError } = useTranscriptionJob(
    step === 'processing' ? importId : null,
    {
      onCompleted: (next) => {
        setSegments(next.segments.map(segment => ({ ...segment })));
        setWarnings(next.warnings ?? []);
        setTitle(next.title || 'Imported');
        setImportId(null);
        setStep('preview');
      },
      onFailed: (message) => {
        setError(message);
        setImportId(null);
        setStep('input');
      },
    },
  );

  useEffect(() => {
    if (step !== 'processing' || startedAt === null) return;
    const timer = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step, startedAt]);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (starting) return;

    if (!agreed) {
      setError('利用権限を有するコンテンツのみ取り込むことに同意してください。');
      return;
    }
    if (!isLikelyYoutubeUrl(sourceUrl)) {
      setError('YouTube の URL を指定してください。');
      return;
    }

    setStarting(true);
    setError(null);
    try {
      const result = await importsApi.youtubeAudioPreview({
        sourceUrl: sourceUrl.trim(),
        language,
        preferSubtitles,
        agreeToTerms: agreed,
      });
      setImportId(result.importId);
      setTitle(result.title ?? '');
      setStartedAt(Date.now());
      setElapsedSec(0);
      setStep('processing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'YouTube の取り込みに失敗しました');
    } finally {
      setStarting(false);
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

    const activeSegments = toSavableSegments(segments, applyFormatting);
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
        sourceType: 'youtube_audio',
        sourceUrl: sourceUrl.trim(),
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
    setStep('input');
    setImportId(null);
    setSegments([]);
    setWarnings([]);
    setError(null);
    setStartedAt(null);
    setElapsedSec(0);
  }

  const progress = job?.progress ?? 0;
  const processingLabel = job?.status === 'queued' ? '待機中…' : '動画を処理中…';

  return (
    <div>
      <h1 className={styles.title}>YouTubeから取り込む</h1>
      {(error ?? pollError) && <p className={styles.error}>{error ?? pollError}</p>}

      {step === 'input' && (
        <form className={styles.form} onSubmit={handleStart}>
          <div className={styles.field}>
            <label>YouTube URL *</label>
            <input
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={sourceUrl}
              onChange={e => setSourceUrl(e.target.value)}
              required
            />
            <p className={audioStyles.hint}>
              字幕（手動・自動生成）があればそれを優先し、無い場合は音声を文字起こしします。
            </p>
          </div>

          <div className={styles.field}>
            <label>言語</label>
            <select value={language} onChange={e => setLanguage(e.target.value)}>
              {LANGUAGES.map(item => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>

          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={preferSubtitles}
              onChange={e => setPreferSubtitles(e.target.checked)}
            />
            字幕があれば字幕から取り込む（オフにすると常に音声から文字起こし）
          </label>

          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
            />
            利用権限を有するコンテンツのみ取り込み、YouTube の利用規約に従います
          </label>

          <div className={audioStyles.actionsRow}>
            <button type="submit" className={styles.btnPrimary} disabled={starting || !sourceUrl.trim()}>
              {starting ? '開始中…' : '取り込み開始'}
            </button>
            <span className={audioStyles.hint}>
              ダウンロードした音声は処理後にサーバーから自動削除されます。
            </span>
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
            {progress}% 完了。動画の長さによっては数分かかることがあります。この画面を閉じないでください。
          </p>
        </div>
      )}

      {step === 'preview' && (
        <TranscriptEditor
          segments={segments}
          warnings={warnings}
          title={title}
          difficulty={difficulty}
          applyFormatting={applyFormatting}
          saving={saving}
          resetLabel="別の動画を取り込む"
          onTitleChange={setTitle}
          onDifficultyChange={setDifficulty}
          onApplyFormattingChange={setApplyFormatting}
          onSegmentChange={handleSegmentChange}
          onSegmentDelete={handleSegmentDelete}
          onSegmentRestore={handleSegmentRestore}
          onSave={handleSave}
          onReset={handleReset}
        />
      )}
    </div>
  );
}
