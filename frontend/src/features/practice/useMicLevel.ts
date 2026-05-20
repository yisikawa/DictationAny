import { useState, useRef, useCallback } from 'react';

export function useMicLevel() {
  const [level, setLevel] = useState(0);
  const refs = useRef<{ raf: number; ctx: AudioContext | null }>({ raf: 0, ctx: null });

  const startMonitor = useCallback(async (stream: MediaStream) => {
    const ctx = new AudioContext();
    refs.current.ctx = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    function tick() {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setLevel(avg);
      refs.current.raf = requestAnimationFrame(tick);
    }
    tick();
  }, []);

  const stopMonitor = useCallback(() => {
    cancelAnimationFrame(refs.current.raf);
    refs.current.ctx?.close().catch(() => {});
    refs.current = { raf: 0, ctx: null };
    setLevel(0);
  }, []);

  return { level, startMonitor, stopMonitor };
}
