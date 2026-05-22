import { useState } from 'react';
import * as recognition from './recognition';
import { appendRecognizedText } from './textUtils';

const MIC_ERROR_MESSAGES: Record<string, string> = {
  'no-speech': '音声が検知できませんでした。下の「マイクテスト」で音量を確認してください。',
  'network': 'ネットワークエラー。Chromeの音声認識はインターネット接続が必要です。',
  'not-allowed': 'マイクへのアクセスが拒否されました。ブラウザの設定を確認してください。',
  'audio-capture': 'マイクが見つかりません。接続を確認してください。',
  'service-not-allowed': 'このブラウザでは音声認識を利用できません。iPhoneの場合はSafariをご利用ください。',
};

interface UseRecordingOptions {
  lang: string;
  startMonitor: (stream: MediaStream) => void;
  showMeter: () => void;
  hideMeterDelayed: () => void;
  onFinalText: (text: string) => void;
}

export function useRecording({
  lang,
  startMonitor,
  showMeter,
  hideMeterDelayed,
  onFinalText,
}: UseRecordingOptions) {
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState('');
  const [soundDetected, setSoundDetected] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  function stopRecording() {
    setRecording(false);
    setInterim('');
    setSoundDetected(false);
    hideMeterDelayed();
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
      lang,
      captureAudio: useMicMonitor,
      onInterim: (text) => { setInterim(text); },
      onFinal: (text) => {
        onFinalText(text);
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

  return { recording, interim, soundDetected, micError, toggleRecording };
}
