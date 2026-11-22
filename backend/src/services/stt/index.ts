import { openAiCompatibleProvider } from './openAiCompatibleProvider';
import { whisperCppProvider } from './whisperCppProvider';
import type { SttProvider } from './types';

/**
 * STT_PROVIDER で実装を切り替える。
 * - whisper-cpp（既定）: ローカルの whisper.cpp。音声を外部送信しない
 * - openai-compatible: OpenAI 互換の /audio/transcriptions API
 */
export function getSttProvider(): SttProvider {
  const provider = (process.env.STT_PROVIDER ?? 'whisper-cpp').trim();
  return provider === 'openai-compatible' ? openAiCompatibleProvider : whisperCppProvider;
}

export type { SttOptions, SttProvider, SttProviderName, TranscriptResult } from './types';
