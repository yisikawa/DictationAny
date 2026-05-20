import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { importsApi } from '../features/imports/api';
import { detectFormat } from '../features/imports/subtitleParser';
import type { ImportPreviewResponse } from '../types';
import styles from './ImportNewPage.module.css';

type Step = 'input' | 'preview';

export default function ImportNewPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('input');
  const [sourceType, setSourceType] = useState('youtube');
  const [sourceUrl, setSourceUrl] = useState('');
  const [language, setLanguage] = useState('en-US');
  const [subtitleText, setSubtitleText] = useState('');
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) { setError('著作権・利用規約の確認が必要です。'); return; }
    setLoading(true);
    setError(null);
    try {
      const format = detectFormat(subtitleText);
      const result = await importsApi.preview({ sourceType, sourceUrl, language, subtitleText, subtitleFormat: format });
      setPreview(result);
      setTitle(result.title);
      setStep('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : '取り込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      await importsApi.saveMaterial({
        importId: preview.importId,
        title,
        sourceType: preview.sourceType,
        sourceUrl: preview.sourceUrl,
        language: preview.language,
        difficulty: difficulty || undefined,
        segments: preview.segments,
      });
      navigate('/materials');
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  function msToTime(ms?: number) {
    if (ms === undefined) return '';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  return (
    <div>
      <h1 className={styles.title}>外部教材取り込み</h1>

      {error && <p className={styles.error}>{error}</p>}

      {step === 'input' && (
        <form className={styles.form} onSubmit={handlePreview}>
          <div className={styles.field}>
            <label>取り込み元</label>
            <select value={sourceType} onChange={e => setSourceType(e.target.value)}>
              <option value="youtube">YouTube</option>
              <option value="udemy">Udemy</option>
              <option value="subtitle_file">字幕ファイル</option>
              <option value="other">その他</option>
            </select>
          </div>
          <div className={styles.field}>
            <label>動画 URL（任意）</label>
            <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} type="url" placeholder="https://..." />
          </div>
          <div className={styles.field}>
            <label>言語</label>
            <select value={language} onChange={e => setLanguage(e.target.value)}>
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="ja-JP">日本語</option>
            </select>
          </div>
          <div className={styles.field}>
            <label>字幕テキスト（SRT / VTT / プレーンテキスト）*</label>
            <textarea
              value={subtitleText}
              onChange={e => setSubtitleText(e.target.value)}
              rows={10}
              placeholder={'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nThe city council approved a new plan.'}
              required
            />
          </div>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
            取り込むコンテンツの利用権限を持ち、各サービスの利用規約に従っています
          </label>
          <button type="submit" className={styles.btnPrimary} disabled={loading}>
            {loading ? 'プレビュー中…' : 'プレビュー'}
          </button>
        </form>
      )}

      {step === 'preview' && preview && (
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
          </div>

          <h2 className={styles.sectionTitle}>字幕プレビュー（{preview.segments.length} 件）</h2>
          <div className={styles.segmentList}>
            {preview.segments.map((seg, i) => (
              <div key={i} className={styles.segment}>
                {seg.startTimeMs !== undefined && (
                  <span className={styles.time}>{msToTime(seg.startTimeMs)} → {msToTime(seg.endTimeMs)}</span>
                )}
                <span>{seg.text}</span>
              </div>
            ))}
          </div>

          <div className={styles.actions}>
            <button className={styles.btnSecondary} onClick={() => setStep('input')}>戻る</button>
            <button className={styles.btnPrimary} onClick={handleSave} disabled={loading}>
              {loading ? '保存中…' : '教材として保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
