export interface RecognitionOptions {
  lang: string;
  captureAudio?: boolean;
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onSoundStart?: () => void;
  onSoundEnd?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionCtor = new () => any;

function getCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

// iOS の Chrome/Firefox では webkitSpeechRecognition は存在するが service-not-allowed になる
function isIOSNonSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (!/iPad|iPhone|iPod/.test(ua)) return false;
  return /CriOS|FxiOS|OPiOS/.test(ua);
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let current: any | null = null;
let currentStream: MediaStream | null = null;
// Android Chrome は continuous=true でも onend で勝手に停止するため、再起動フラグで対処
let shouldContinue = false;

export function isSupported(): boolean {
  if (isIOSNonSafari()) return false;
  return !!getCtor() && !!navigator.mediaDevices;
}

function releaseStream() {
  currentStream?.getTracks().forEach(t => t.stop());
  currentStream = null;
}

function startRec(Ctor: SpeechRecognitionCtor, options: RecognitionOptions): void {
  // Android Chrome は isFinal=true を返さずセッションを終了する場合があるため
  // 最後の interim テキストを追跡して onend 時に確定させる
  let lastInterim = '';

  const rec = new Ctor();
  rec.lang = options.lang;
  rec.continuous = true;
  rec.interimResults = true;

  rec.onsoundstart = () => options.onSoundStart?.();
  rec.onsoundend = () => options.onSoundEnd?.();

  rec.onresult = (event: { resultIndex: number; results: SpeechRecognitionResultList }) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        const text = result[0].transcript.trim();
        if (text) {
          options.onFinal?.(text);
          lastInterim = '';
        }
      } else {
        interim += result[0].transcript;
      }
    }
    lastInterim = interim.trim();
    options.onInterim?.(lastInterim);
  };

  rec.onend = () => {
    current = null;
    if (shouldContinue) {
      // Android Chrome can end short sessions while a phrase is still interim.
      // Keep it as interim during auto-restart so partial phrases are not appended repeatedly.
      try {
        startRec(Ctor, options);
        return;
      } catch {
        shouldContinue = false;
      }
    }

    // When the user stops recording, keep the last recognized phrase even if
    // the browser never marked it final.
    if (lastInterim) {
      options.onFinal?.(lastInterim);
      options.onInterim?.('');
      lastInterim = '';
    }
    releaseStream();
    options.onEnd?.();
  };

  rec.onerror = (event: { error: string }) => {
    console.warn('[SpeechRecognition] error:', event.error);
    // no-speech と aborted は非致命的 — onend で再起動させる
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    // 致命的なエラーは再起動せず報告する
    shouldContinue = false;
    options.onError?.(event.error);
    // onend が続けて発火してストリーム解放・終了通知を行う
  };

  current = rec;
  try {
    rec.start();
  } catch (e) {
    shouldContinue = false;
    current = null;
    options.onError?.(e instanceof Error ? e.name : 'start-failed');
    options.onEnd?.();
  }
}

export async function start(options: RecognitionOptions): Promise<MediaStream | null> {
  const Ctor = getCtor();
  if (!Ctor) return null;
  stop();
  shouldContinue = true;

  if (options.captureAudio !== false) {
    try {
      currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      options.onError?.('not-allowed');
      options.onEnd?.();
      return null;
    }
  }

  startRec(Ctor, options);
  return currentStream;
}

export function stop(): void {
  shouldContinue = false;
  if (current) {
    current.stop();
    current = null;
  }
  releaseStream();
}
