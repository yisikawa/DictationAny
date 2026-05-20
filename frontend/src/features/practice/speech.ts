export interface SpeechOptions {
  lang: string;
  rate: number;
  onEnd?: () => void;
  onError?: (e: SpeechSynthesisErrorEvent) => void;
}

let current: SpeechSynthesisUtterance | null = null;

export function isSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speak(text: string, options: SpeechOptions): void {
  if (!isSupported()) return;
  stop();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = options.lang;
  utter.rate = options.rate;
  if (options.onEnd) utter.onend = options.onEnd;
  if (options.onError) utter.onerror = options.onError;

  current = utter;
  window.speechSynthesis.speak(utter);
}

export function pause(): void {
  if (isSupported()) window.speechSynthesis.pause();
}

export function resume(): void {
  if (isSupported()) window.speechSynthesis.resume();
}

export function stop(): void {
  if (isSupported()) {
    window.speechSynthesis.cancel();
    current = null;
  }
}

export function getVoices(): SpeechSynthesisVoice[] {
  if (!isSupported()) return [];
  return window.speechSynthesis.getVoices();
}

export function speakSentences(
  sentences: string[],
  options: SpeechOptions,
  onSentenceStart?: (index: number) => void
): void {
  if (!isSupported() || sentences.length === 0) return;
  stop();

  let index = 0;

  function next() {
    if (index >= sentences.length) return;
    if (onSentenceStart) onSentenceStart(index);
    speak(sentences[index], {
      ...options,
      onEnd: () => {
        index++;
        if (index < sentences.length) {
          setTimeout(next, 400);
        } else {
          options.onEnd?.();
        }
      },
    });
  }

  next();
}

export function splitToSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}
