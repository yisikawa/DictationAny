import { describe, it, expect } from 'vitest';
import { ProcessError, runProcess } from '../utils/processRunner';

const node = process.execPath;

describe('runProcess', () => {
  it('標準出力を返す', async () => {
    const result = await runProcess(node, ['-e', 'process.stdout.write("hello\\n")']);
    expect(result.stdout).toContain('hello');
  });

  it('存在しないコマンドは ENOENT として失敗する', async () => {
    await expect(runProcess('definitely-not-a-real-command-xyz-123', []))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('異常終了は ProcessError として失敗する', async () => {
    await expect(runProcess(node, ['-e', 'process.exit(3)']))
      .rejects.toBeInstanceOf(ProcessError);
  });

  it('タイムアウトで打ち切る', async () => {
    await expect(
      runProcess(node, ['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 300 }),
    ).rejects.toThrow('タイムアウト');
  }, 15000);

  it('AbortSignal で中断できる', async () => {
    const abort = new AbortController();
    setTimeout(() => abort.abort(), 100);

    await expect(
      runProcess(node, ['-e', 'setTimeout(() => {}, 10000)'], { signal: abort.signal }),
    ).rejects.toThrow('中断');
  }, 15000);

  it('標準エラーを行単位でコールバックする', async () => {
    const lines: string[] = [];
    await runProcess(
      node,
      ['-e', 'process.stderr.write("progress = 10%\\nprogress = 20%\\n")'],
      { onStderr: (line) => lines.push(line) },
    );
    expect(lines).toEqual(['progress = 10%', 'progress = 20%']);
  });
});
