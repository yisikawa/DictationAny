import { useState, useCallback } from 'react';

export interface AudioDevice {
  deviceId: string;
  label: string;
}

export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);

  const load = useCallback(async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    const inputs = all
      .filter(d => d.kind === 'audioinput')
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `マイク ${i + 1}`,
      }));
    setDevices(inputs);
    return inputs;
  }, []);

  return { devices, load };
}
