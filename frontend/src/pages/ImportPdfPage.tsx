import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { importsApi } from '../features/imports/api';
import type { ImportPreviewResponse } from '../types';
import styles from './ImportNewPage.module.css';
import pdfStyles from './ImportPdfPage.module.css';

type Step = 'upload' | 'preview';

export default function ImportPdfPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('en-US');
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function handleFileChange(f: File | null) {
    if (!f) return;
    if (f.type !== 'application/pdf') { setError('PDFファイルを選択してください。'); return; }
    setFile(f);
    setError(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0] ?? null;
    handleFileChange(f);
  }

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('PDFファイルを選択してください。'); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await importsApi.pdfPreview({ file, language });
      setPreview(result);
      setTitle(result.title);
      setStep('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF取り込みに失敗しました');
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
        sourceType: 'pdf',
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

  return (
    <div>
      <h1 className={styles.title}>PDFから取り込む</h1>
      {error && <p className={styles.error}>{error}</p>}

      {step === 'upload' && (
        <form className={styles.form} onSubmit={handlePreview}>
          <div className={styles.field}>
            <label>PDFファイル *</label>
            <div
              className={`${pdfStyles.dropZone} ${dragging ? pdfStyles.dragging : ''} ${file ? pdfStyles.hasFile : ''}`}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              {file ? (
                <span className={pdfStyles.fileName}>{file.name}</span>
              ) : (
                <span className={pdfStyles.dropHint}>クリックまたはドラッグ&ドロップでPDFを選択</span>
              )}
              <input
                type="file"
                accept="application/pdf"
                className={pdfStyles.fileInput}
                onChange={e => handleFileChange(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <div className={styles.field}>
            <label>言語</label>
            <select value={language} onChange={e => setLanguage(e.target.value)}>
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="ja-JP">日本語</option>
              <option value="fr-FR">Français</option>
              <option value="de-DE">Deutsch</option>
              <option value="es-ES">Español</option>
            </select>
          </div>
          <button type="submit" className={styles.btnPrimary} disabled={loading || !file}>
            {loading ? 'テキスト抽出中…' : 'プレビュー'}
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

          <h2 className={styles.sectionTitle}>テキストプレビュー（{preview.segments.length} 件）</h2>
          <div className={styles.segmentList}>
            {preview.segments.map((seg, i) => (
              <div key={i} className={styles.segment}>
                <span>{seg.text}</span>
              </div>
            ))}
          </div>

          <div className={styles.actions}>
            <button className={styles.btnSecondary} onClick={() => setStep('upload')}>戻る</button>
            <button className={styles.btnPrimary} onClick={handleSave} disabled={loading}>
              {loading ? '保存中…' : '教材として保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
