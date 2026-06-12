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
  // Chrome では cancel() 直後の speak() がサイレントに失敗するため1tick遅らせる
  setTimeout(() => window.speechSynthesis.speak(utter), 50);
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
    if (index >= sentences.length) {
      options.onEnd?.();
      return;
    }
    if (onSentenceStart) onSentenceStart(index);

    const utter = new SpeechSynthesisUtterance(sentences[index]);
    utter.lang = options.lang;
    utter.rate = options.rate;
    utter.onend = () => {
      if (current !== utter) return; // stop() が外部から呼ばれた場合は連鎖を止める
      index++;
      setTimeout(next, 400);
    };
    utter.onerror = (e) => {
      // cancel/interrupted はユーザー操作由来なのでエラー扱いしない
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        options.onError?.(e);
      }
    };

    current = utter;
    window.speechSynthesis.speak(utter);
  }

  // Chrome では cancel() 直後に speak() を呼ぶとサイレントに失敗するため1tick遅らせる
  setTimeout(next, 50);
}

const ABBREV_RE = /\b(Mr|Mrs|Ms|Miss|Dr|Prof|Rev|Sr|Jr|St|Ave|Blvd|Rd|Ln|vs|etc)\./g;
const PLACEHOLDER = '\x01';

export function splitToSentences(text: string): string[] {
  const protected_ = text.replace(ABBREV_RE, `$1${PLACEHOLDER}`);
  return protected_
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim().replace(/\x01/g, '.'))
    .filter(Boolean);
}
