import { useState, useRef, useCallback } from 'react';
import { useAudioDevices } from './useAudioDevices';

export function useMicTest(
  startMonitor: (stream: MediaStream) => void,
  stopMonitor: () => void,
) {
  const [testingMic, setTestingMic] = useState(false);
  const [meterVisible, setMeterVisible] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [micTestError, setMicTestError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const meterHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { devices, load: loadDevices } = useAudioDevices();

  const stopTestStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const showMeter = useCallback(() => {
    if (meterHideTimer.current) clearTimeout(meterHideTimer.current);
    setMeterVisible(true);
  }, []);

  const hideMeterDelayed = useCallback(() => {
    if (meterHideTimer.current) clearTimeout(meterHideTimer.current);
    meterHideTimer.current = setTimeout(() => {
      setMeterVisible(false);
      stopMonitor();
    }, 3000);
  }, [stopMonitor]);

  async function toggleMicTest() {
    if (testingMic) {
      stopMonitor();
      stopTestStream();
      setTestingMic(false);
      setMeterVisible(false);
      return;
    }

    setMicTestError(null);
    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setTestingMic(true);
      showMeter();
      startMonitor(stream);

      if (devices.length === 0) {
        const list = await loadDevices();
        if (list.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(list[0].deviceId);
        }
      }
    } catch {
      setMicTestError('マイクへのアクセスに失敗しました。ブラウザの許可設定を確認してください。');
    }
  }

  async function handleDeviceChange(deviceId: string) {
    setSelectedDeviceId(deviceId);
    if (!testingMic) return;

    stopMonitor();
    stopTestStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
      });
      streamRef.current = stream;
      startMonitor(stream);
    } catch {
      setMicTestError('選択したデバイスにアクセスできませんでした。');
      setTestingMic(false);
    }
  }

  return {
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
  };
}
