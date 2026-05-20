export interface RecognitionOptions {
  lang: string;
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onSoundStart?: () => void;
  onSoundEnd?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

function getCtor(): typeof SpeechRecognition | undefined {
  if (typeof window === 'undefined') return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return window.SpeechRecognition ?? (window as any).webkitSpeechRecognition;
}

let current: SpeechRecognition | null = null;
let currentStream: MediaStream | null = null;

export function isSupported(): boolean {
  return !!getCtor() && !!navigator.mediaDevices;
}

function releaseStream() {
  currentStream?.getTracks().forEach(t => t.stop());
  currentStream = null;
}

export async function start(options: RecognitionOptions): Promise<MediaStream | null> {
  const Ctor = getCtor();
  if (!Ctor) return null;
  stop();

  try {
    currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    options.onError?.('not-allowed');
    options.onEnd?.();
    return null;
  }

  const rec = new Ctor();
  rec.lang = options.lang;
  rec.continuous = true;
  rec.interimResults = true;

  rec.onsoundstart = () => options.onSoundStart?.();
  rec.onsoundend = () => options.onSoundEnd?.();

  rec.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        const text = result[0].transcript.trim();
        if (text) options.onFinal?.(text);
      } else {
        interim += result[0].transcript;
      }
    }
    options.onInterim?.(interim.trim());
  };

  rec.onend = () => {
    releaseStream();
    current = null;
    options.onEnd?.();
  };

  rec.onerror = (event) => {
    console.warn('[SpeechRecognition] error:', event.error);
    releaseStream();
    if (event.error !== 'aborted') {
      options.onError?.(event.error);
    }
    current = null;
    options.onEnd?.();
  };

  current = rec;
  rec.start();

  return currentStream;
}

export function stop(): void {
  if (current) {
    current.stop();
    current = null;
  }
  releaseStream();
}
