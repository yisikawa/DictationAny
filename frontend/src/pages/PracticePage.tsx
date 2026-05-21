import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMaterial } from '../features/materials/hooks';
import { attemptsApi } from '../features/attempts/api';
import TextToSpeechControls from '../components/TextToSpeechControls';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import * as recognition from '../features/practice/recognition';
import { useMicLevel } from '../features/practice/useMicLevel';
import { useAudioDevices } from '../features/practice/useAudioDevices';
import styles from './PracticePage.module.css';

type DisplayMode = 'practice' | 'blind';

function appendRecognizedText(prev: string, next: string): string {
  const text = next.trim();
  if (!text) return prev;
  if (!prev.trim()) return text;

  const lines = prev.split('\n');
  const last = lines[lines.length - 1]?.trim() ?? '';
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
  const lastNorm = normalize(last);
  const textNorm = normalize(text);

  if (lastNorm === textNorm || lastNorm.startsWith(textNorm)) return prev;
  if (textNorm.startsWith(lastNorm)) {
    lines[lines.length - 1] = text;
    return lines.join('\n');
  }

  return `${prev}\n${text}`;
}

const MIC_ERROR_MESSAGES: Record<string, string> = {
  'no-speech': '音声が検知できませんでした。下の「マイクテスト」で音量を確認してください。',
  'network': 'ネットワークエラー。Chromeの音声認識はインターネット接続が必要です。',
  'not-allowed': 'マイクへのアクセスが拒否されました。ブラウザの設定を確認してください。',
  'audio-capture': 'マイクが見つかりません。接続を確認してください。',
  'service-not-allowed': 'このブラウザでは音声認識を利用できません。iPhoneの場合はSafariをご利用ください。',
};

export default function PracticePage() {
  const { materialId } = useParams<{ materialId: string }>();
  const navigate = useNavigate();
  const { material, loading, error } = useMaterial(materialId!);
  const [mode, setMode] = useState<DisplayMode>('practice');
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState('');
  const [soundDetected, setSoundDetected] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [meterVisible, setMeterVisible] = useState(false);
  const [testingMic, setTestingMic] = useState(false);
  const [testStream, setTestStream] = useState<MediaStream | null>(null);
  const { devices, load: loadDevices } = useAudioDevices();
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const meterHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { level: micLevel, startMonitor, stopMonitor } = useMicLevel();

  useEffect(() => () => { recognition.stop(); stopMonitor(); stopTestStream(); }, [stopMonitor]);

  if (loading) return <LoadingState />;
  if (error || !material) return <ErrorState message={error ?? '教材が見つかりません'} />;

  function stopTestStream() {
    testStream?.getTracks().forEach(t => t.stop());
    setTestStream(null);
  }

  function showMeter() {
    if (meterHideTimer.current) clearTimeout(meterHideTimer.current);
    setMeterVisible(true);
  }

  function hideMeterDelayed() {
    if (meterHideTimer.current) clearTimeout(meterHideTimer.current);
    meterHideTimer.current = setTimeout(() => {
      setMeterVisible(false);
      stopMonitor();
    }, 3000);
  }

  function stopRecording() {
    setRecording(false);
    setInterim('');
    setSoundDetected(false);
    hideMeterDelayed();
  }

  async function toggleMicTest() {
    if (testingMic) {
      stopMonitor();
      stopTestStream();
      setTestingMic(false);
      setMeterVisible(false);
      return;
    }

    setMicError(null);
    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setTestStream(stream);
      setTestingMic(true);
      showMeter();
      startMonitor(stream);

      // 初回: デバイス一覧を取得
      if (devices.length === 0) {
        const list = await loadDevices();
        if (list.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(list[0].deviceId);
        }
      }
    } catch {
      setMicError('マイクへのアクセスに失敗しました。ブラウザの許可設定を確認してください。');
    }
  }

  async function handleDeviceChange(deviceId: string) {
    setSelectedDeviceId(deviceId);
    if (!testingMic) return;

    // テスト中にデバイスを切り替えたら再起動
    stopMonitor();
    stopTestStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
      });
      setTestStream(stream);
      startMonitor(stream);
    } catch {
      setMicError('選択したデバイスにアクセスできませんでした。');
      setTestingMic(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      recognition.stop();
      stopRecording();
      return;
    }

    setMicError(null);
    const useMicMonitor = !recognition.isAndroid();
    const stream = await recognition.start({
      lang: material!.language,
      captureAudio: useMicMonitor,
      onInterim: (text) => { setInterim(text); },
      onFinal: (text) => {
        setInput(prev => appendRecognizedText(prev, text));
        setInterim('');
      },
      onSoundStart: () => setSoundDetected(true),
      onSoundEnd: () => setSoundDetected(false),
      onEnd: stopRecording,
      onError: (err) => {
        const msg = MIC_ERROR_MESSAGES[err] ?? `音声認識エラー: ${err}`;
        setMicError(msg);
        stopRecording();
      },
    });

    if (stream || !useMicMonitor) {
      setRecording(true);
      if (stream) {
        showMeter();
        startMonitor(stream);
      }
    }
  }

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

      <form onSubmit={handleSubmit} className={styles.inputSection}>
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
