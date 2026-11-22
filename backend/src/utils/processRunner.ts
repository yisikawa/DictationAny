import { spawn } from 'child_process';

export interface RunProcessOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  onStdout?: (line: string) => void;
  onStderr?: (line: string) => void;
}

export interface RunProcessResult {
  stdout: string;
  stderr: string;
}

const STDERR_TAIL_CHARS = 2048;

export class ProcessError extends Error {
  constructor(
    message: string,
    public readonly code?: number | string | null,
    public readonly stderrTail?: string,
  ) {
    super(message);
    this.name = 'ProcessError';
  }
}

function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

/** 子プロセスを起動し、終了まで待つ。シェルを介さないため引数のエスケープ漏れが起きない */
export function runProcess(
  command: string,
  args: string[],
  options: RunProcessOptions = {},
): Promise<RunProcessResult> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, { shell: false, windowsHide: true });
    } catch (err) {
      if (isEnoent(err)) {
        reject(new ProcessError(`コマンドが見つかりません: ${command}`, 'ENOENT'));
        return;
      }
      reject(err);
      return;
    }

    let stdout = '';
    let stderr = '';
    let stdoutBuf = '';
    let stderrBuf = '';
    let settled = false;
    let killedByAbort = false;
    let killedByTimeout = false;
    let timer: NodeJS.Timeout | undefined;

    const emitLines = (buf: string, onLine?: (line: string) => void): string => {
      if (!onLine) return '';
      const lines = buf.split(/\r?\n/);
      const rest = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) onLine(line);
      }
      return rest;
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      fn();
    };

    const onAbort = () => {
      killedByAbort = true;
      try {
        child.kill();
      } catch {
        // 既に終了している場合は何もしない
      }
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');

    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
      stdoutBuf += chunk;
      stdoutBuf = emitLines(stdoutBuf, options.onStdout);
    });

    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
      stderrBuf += chunk;
      stderrBuf = emitLines(stderrBuf, options.onStderr);
    });

    child.on('error', (err) => {
      finish(() => {
        if (isEnoent(err)) {
          reject(new ProcessError(`コマンドが見つかりません: ${command}`, 'ENOENT'));
        } else {
          reject(new ProcessError(`コマンドの起動に失敗しました: ${err.message}`, null));
        }
      });
    });

    child.on('close', (code) => {
      emitLines(`${stdoutBuf}\n`, options.onStdout);
      emitLines(`${stderrBuf}\n`, options.onStderr);

      const stderrTail = stderr.length > STDERR_TAIL_CHARS
        ? stderr.slice(-STDERR_TAIL_CHARS)
        : stderr;

      finish(() => {
        if (killedByAbort) {
          reject(new ProcessError('クライアントによって中断されました。', code, stderrTail));
          return;
        }
        if (killedByTimeout) {
          const seconds = options.timeoutMs ? Math.round(options.timeoutMs / 1000) : 0;
          reject(new ProcessError(`処理がタイムアウトしました（${seconds}秒）。`, code, stderrTail));
          return;
        }
        if (code !== 0) {
          reject(new ProcessError(`コマンドが異常終了しました (exit ${code ?? 'unknown'})。`, code, stderrTail));
          return;
        }
        resolve({ stdout, stderr });
      });
    });

    if (options.timeoutMs && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        killedByTimeout = true;
        try {
          child.kill();
        } catch {
          // 既に終了している場合は何もしない
        }
      }, options.timeoutMs);
    }
  });
}
