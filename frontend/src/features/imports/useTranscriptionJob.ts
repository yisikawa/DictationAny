import { useEffect, useRef, useState } from 'react';
import { importsApi } from './api';
import type { ImportJobResponse } from '../../types';

const POLL_INTERVAL_MS = 2000;

export interface TranscriptionJobHandlers {
  onCompleted?: (job: ImportJobResponse) => void;
  onFailed?: (message: string, job: ImportJobResponse) => void;
}

/**
 * 文字起こしジョブを 2 秒間隔でポーリングする。
 * completed / failed に到達するか、importId が null になったら停止する。
 */
export function useTranscriptionJob(
  importId: string | null,
  handlers: TranscriptionJobHandlers = {},
) {
  const [job, setJob] = useState<ImportJobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handlersRef = useRef<TranscriptionJobHandlers>(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!importId) return;

    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const next = await importsApi.getJob(importId);
        if (cancelled) return;
        setJob(next);
        setError(null);

        if (next.status === 'completed') {
          handlersRef.current.onCompleted?.(next);
          return;
        }
        if (next.status === 'failed') {
          handlersRef.current.onFailed?.(next.errorMessage ?? '処理に失敗しました。', next);
          return;
        }
        timer = window.setTimeout(poll, POLL_INTERVAL_MS);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '状態の取得に失敗しました');
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [importId]);

  return { job, error };
}
