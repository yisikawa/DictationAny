import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useMaterial } from '../features/materials/hooks';
import { usePracticeSubmit } from '../features/practice/usePracticeSubmit';
import { useMicTest } from '../features/practice/useMicTest';
import { useRecording } from '../features/practice/useRecording';
import { appendRecognizedText } from '../features/practice/textUtils';
import { useMicLevel } from '../features/practice/useMicLevel';
import TextToSpeechControls from '../components/TextToSpeechControls';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import * as recognition from '../features/practice/recognition';
import styles from './PracticePage.module.css';

type DisplayMode = 'practice' | 'blind';

export default function PracticePage() {
  const { materialId } = useParams<{ materialId: string }>();
  const { material, loading, error } = useMaterial(materialId!);
  const { submitting, submitError, handleSubmit } = usePracticeSubmit(materialId!);
  const [mode, setMode] = useState<DisplayMode>('practice');
  const [input, setInput] = useState('');
  const { level: micLevel, startMonitor, stopMonitor } = useMicLevel();
  const {
    testingMic,
    meterVisible,
    devices,
    selectedDeviceId,
    micTestError,
    showMeter,
    hideMeterDelayed,
    toggleMicTest,
    handleDeviceChange,
    stopTestStream,
  } = useMicTest(startMonitor, stopMonitor);
  const { recording, interim, soundDetected, micError: recordingError, toggleRecording } = useRecording({
    lang: material?.language ?? '',
    startMonitor,
    showMeter,
    hideMeterDelayed,
    onFinalText: (text) => setInput(prev => appendRecognizedText(prev, text)),
  });

  useEffect(() => () => { recognition.stop(); stopMonitor(); stopTestStream(); }, [stopMonitor, stopTestStream]);

  if (loading) return <LoadingState />;
  if (error || !material) return <ErrorState message={error ?? '教材が見つかりません'} />;

  const micError = recordingError ?? micTestError;
  const levelPct = Math.min(100, (micLevel / 35) * 100);

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

      <form onSubmit={(e) => handleSubmit(e, input)} className={styles.inputSection}>
        <div className={styles.inputHeader}>
          <h3 className={styles.sectionLabel}>聞き取った内容を入力してください</h3>
          {recognition.isSupported() && (
            <div className={styles.micArea}>
              {recording && (
                <span className={soundDetected ? styles.soundOn : styles.soundOff}>
                  {soundDetected ? '🔊 認識中...' : '🎤 話してください'}
                </span>
              )}
              <button
                type="button"
                className={recording ? styles.btnMicActive : styles.btnMic}
                onClick={toggleRecording}
                aria-label={recording ? '録音停止' : '録音開始'}
              >
                {recording ? '■ 停止' : '🎤 録音'}
              </button>
            </div>
          )}
        </div>

        {micError && (
          <div className={styles.micErrorMsg}>
            <p>{micError}</p>
            {(micError.includes('no-speech') || micError.includes('音声が検知')) && (
              <ol className={styles.micFixSteps}>
                <li>タスクバーの🔊を右クリック →「サウンドの設定を開く」</li>
                <li>「サウンド コントロール パネル」→「録音」タブを開く</li>
                <li>「マイク (Logi C270)」を右クリック →<strong>「既定の通信デバイスとして設定」</strong></li>
                <li>ページをリロードして再度「録音」を押す</li>
              </ol>
            )}
          </div>
        )}

        {/* マイクテストパネル */}
        {recognition.isSupported() && (
          <div className={styles.micTestPanel}>
            <div className={styles.micTestHeader}>
              <button
                type="button"
                className={testingMic ? styles.btnMicActive : styles.btnMic}
                onClick={toggleMicTest}
              >
                {testingMic ? '■ テスト停止' : '🔍 マイクテスト'}
              </button>
              {devices.length > 1 && (
                <select
                  className={styles.deviceSelect}
                  value={selectedDeviceId}
                  onChange={e => handleDeviceChange(e.target.value)}
                >
                  {devices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                  ))}
                </select>
              )}
            </div>

            {meterVisible && (
              <div className={styles.micMeterWrap}>
                <span className={styles.micMeterLabel}>
                  マイク音量: {Math.round(levelPct)}%
                  {levelPct < 3
                    ? ' ⚠ 音声なし — このデバイスは無効か別のデバイスです'
                    : ' ✓ 音声検知'}
                </span>
                <div className={styles.micMeter}>
                  <div
                    className={levelPct >= 3 ? styles.micMeterBar : styles.micMeterBarZero}
                    style={{ width: `${Math.max(levelPct, 1)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <textarea
          className={styles.textarea}
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={6}
          placeholder="ここに入力…"
        />
        {interim && <p className={styles.interim}>{interim}</p>}
        {submitError && <p className={styles.error}>{submitError}</p>}
        <button type="submit" className={styles.btnSubmit} disabled={submitting || !input.trim()}>
          {submitting ? '採点中…' : '提出して採点'}
        </button>
      </form>
    </div>
  );
}
