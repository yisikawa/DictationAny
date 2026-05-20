import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMaterial } from '../features/materials/hooks';
import { attemptsApi } from '../features/attempts/api';
import TextToSpeechControls from '../components/TextToSpeechControls';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import styles from './PracticePage.module.css';

type DisplayMode = 'practice' | 'blind';

export default function PracticePage() {
  const { materialId } = useParams<{ materialId: string }>();
  const navigate = useNavigate();
  const { material, loading, error } = useMaterial(materialId!);
  const [mode, setMode] = useState<DisplayMode>('practice');
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (loading) return <LoadingState />;
  if (error || !material) return <ErrorState message={error ?? '教材が見つかりません'} />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const attempt = await attemptsApi.create(material!.id, input);
      navigate(`/results/${attempt.id}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '提出に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.topBar}>
        <h1 className={styles.title}>{material.title}</h1>
        <div className={styles.modeToggle}>
          <button
            className={mode === 'practice' ? styles.modeActive : styles.modeBtn}
            onClick={() => setMode('practice')}
          >
            Practice
          </button>
          <button
            className={mode === 'blind' ? styles.modeActive : styles.modeBtn}
            onClick={() => setMode('blind')}
          >
            Blind
          </button>
        </div>
      </div>

      <TextToSpeechControls text={material.body} lang={material.language} />

      {mode === 'practice' && (
        <div className={styles.originalText}>
          <h3 className={styles.sectionLabel}>原文</h3>
          <p className={styles.body}>{material.body}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.inputSection}>
        <h3 className={styles.sectionLabel}>聞き取った内容を入力してください</h3>
        <textarea
          className={styles.textarea}
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={6}
          placeholder="ここに入力…"
        />
        {submitError && <p className={styles.error}>{submitError}</p>}
        <button type="submit" className={styles.btnSubmit} disabled={submitting || !input.trim()}>
          {submitting ? '採点中…' : '提出して採点'}
        </button>
      </form>
    </div>
  );
}
