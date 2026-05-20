import { useState, useEffect, useRef } from 'react';
import { speakSentences, speak, pause, resume, stop, splitToSentences, isSupported } from '../features/practice/speech';
import styles from './TextToSpeechControls.module.css';

const RATES = [0.5, 0.75, 1.0, 1.25];

interface Props {
  text: string;
  lang: string;
}

type State = 'idle' | 'playing' | 'paused';

export default function TextToSpeechControls({ text, lang }: Props) {
  const [state, setState] = useState<State>('idle');
  const [rate, setRate] = useState(1.0);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const supported = isSupported();
  const sentences = splitToSentences(text);
  const sentenceRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    return () => stop();
  }, []);

  function handlePlay() {
    if (state === 'paused') {
      resume();
      setState('playing');
      return;
    }
    setState('playing');
    speakSentences(sentences, {
      lang,
      rate,
      onEnd: () => { setState('idle'); setCurrentIndex(-1); },
      onError: () => { setState('idle'); setCurrentIndex(-1); },
    }, (i) => {
      setCurrentIndex(i);
      sentenceRefs.current[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  function handlePause() {
    pause();
    setState('paused');
  }

  function handleStop() {
    stop();
    setState('idle');
    setCurrentIndex(-1);
  }

  function handleReplay() {
    stop();
    setState('playing');
    speakSentences(sentences, {
      lang,
      rate,
      onEnd: () => { setState('idle'); setCurrentIndex(-1); },
      onError: () => { setState('idle'); setCurrentIndex(-1); },
    }, (i) => {
      setCurrentIndex(i);
      sentenceRefs.current[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  function handlePlaySentence(i: number) {
    stop();
    setState('playing');
    speak(sentences[i], {
      lang,
      rate,
      onEnd: () => setState('idle'),
      onError: () => setState('idle'),
    });
  }

  if (!supported) {
    return <p className={styles.unsupported}>このブラウザは音声読み上げに対応していません。</p>;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        {state === 'playing' ? (
          <>
            <button onClick={handlePause} className={styles.btn} title="一時停止">⏸</button>
            <button onClick={handleStop} className={styles.btn} title="停止">⏹</button>
          </>
        ) : (
          <button onClick={handlePlay} className={styles.btnPlay} title="再生">▶ 再生</button>
        )}
        <button onClick={handleReplay} className={styles.btn} title="最初から再生" disabled={state === 'playing'}>⟳</button>

        <div className={styles.rates}>
          {RATES.map(r => (
            <button
              key={r}
              className={rate === r ? styles.rateActive : styles.rate}
              onClick={() => setRate(r)}
            >
              {r}x
            </button>
          ))}
        </div>
      </div>

      {sentences.length > 1 && (
        <div className={styles.sentences}>
          {sentences.map((s, i) => (
            <button
              key={i}
              ref={el => { sentenceRefs.current[i] = el; }}
              className={i === currentIndex ? styles.sentenceActive : styles.sentence}
              onClick={() => handlePlaySentence(i)}
            >
              ▷ {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
