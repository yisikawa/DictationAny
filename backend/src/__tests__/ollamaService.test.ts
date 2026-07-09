import { describe, it, expect, vi, afterEach } from 'vitest';
import { correctOcrWithLlm } from '../services/ollamaService';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchEcho() {
  return vi.fn(async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}') as { messages: { content: string }[] };
    const userContent = body.messages[1].content;
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: userContent } }] }),
    } as unknown as Response;
  });
}

describe('correctOcrWithLlm', () => {
  it('中断済みシグナルを渡すとOllamaを呼ばずにエラーになる', async () => {
    const fetchMock = mockFetchEcho();
    vi.stubGlobal('fetch', fetchMock);

    const abort = new AbortController();
    abort.abort();

    await expect(correctOcrWithLlm('hello world', undefined, abort.signal))
      .rejects.toThrow('中断');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('シグナルなしなら従来どおり動作する', async () => {
    const fetchMock = mockFetchEcho();
    vi.stubGlobal('fetch', fetchMock);

    const result = await correctOcrWithLlm('hello world this is a test sentence.');
    expect(result).toBe('hello world this is a test sentence.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('クライアントが中断していないOllamaタイムアウトはタイムアウトエラーとして報告される', async () => {
    const timeoutError = new Error('The operation was aborted due to timeout');
    timeoutError.name = 'TimeoutError';
    const fetchMock = vi.fn(async () => { throw timeoutError; });
    vi.stubGlobal('fetch', fetchMock);

    const signal = new AbortController().signal;

    await expect(correctOcrWithLlm('hello world', undefined, signal))
      .rejects.toThrow('タイムアウト');
  });
});
