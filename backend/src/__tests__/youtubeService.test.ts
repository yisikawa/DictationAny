import { describe, it, expect, afterEach } from 'vitest';
import {
  buildAudioArgs,
  buildSubtitleArgs,
  parseYoutubeUrl,
  summarizeYtdlpError,
} from '../services/youtubeService';

afterEach(() => {
  delete process.env.YTDLP_JS_RUNTIME;
});

describe('parseYoutubeUrl', () => {
  it('watch URL を受理する', () => {
    expect(parseYoutubeUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw'))
      .toEqual({ videoId: 'jNQXAC9IVRw' });
  });

  it('youtu.be / shorts / embed を受理する', () => {
    expect(parseYoutubeUrl('https://youtu.be/jNQXAC9IVRw?t=10'))
      .toEqual({ videoId: 'jNQXAC9IVRw' });
    expect(parseYoutubeUrl('https://www.youtube.com/shorts/jNQXAC9IVRw'))
      .toEqual({ videoId: 'jNQXAC9IVRw' });
    expect(parseYoutubeUrl('https://www.youtube.com/embed/jNQXAC9IVRw'))
      .toEqual({ videoId: 'jNQXAC9IVRw' });
  });

  it('YouTube 以外のホストを拒否する', () => {
    expect(parseYoutubeUrl('https://example.com/watch?v=jNQXAC9IVRw')).toBeNull();
    expect(parseYoutubeUrl('https://youtube.com.evil.example/watch?v=jNQXAC9IVRw')).toBeNull();
  });

  it('危険なスキーム・不正な ID を拒否する', () => {
    expect(parseYoutubeUrl('javascript:alert(1)')).toBeNull();
    expect(parseYoutubeUrl('file:///C:/video.mp4')).toBeNull();
    expect(parseYoutubeUrl('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(parseYoutubeUrl('https://www.youtube.com/feed/subscriptions')).toBeNull();
  });

  it('空文字を拒否する', () => {
    expect(parseYoutubeUrl('')).toBeNull();
  });
});

describe('yt-dlp の引数生成', () => {
  it('字幕取得は自動字幕・VTT・info.json を指定する', () => {
    const args = buildSubtitleArgs('https://youtu.be/jNQXAC9IVRw', 'en', 'C:/tmp/yt');
    expect(args).toContain('--write-auto-subs');
    expect(args).toContain('--skip-download');
    expect(args[args.indexOf('--sub-format') + 1]).toBe('vtt');
    expect(args[args.indexOf('--sub-langs') + 1]).toBe('en,en-orig');
    expect(args[args.indexOf('-o') + 1]).toBe('C:\\tmp\\yt\\%(id)s.%(ext)s');
    expect(args[args.length - 1]).toBe('https://youtu.be/jNQXAC9IVRw');
  });

  it('音声取得は wav 変換を指定する', () => {
    const args = buildAudioArgs('https://youtu.be/jNQXAC9IVRw', 'C:/tmp/yt');
    expect(args).toContain('-x');
    expect(args[args.indexOf('--audio-format') + 1]).toBe('wav');
    expect(args).toContain('--no-playlist');
  });

  it('YTDLP_JS_RUNTIME を指定すると --js-runtimes が付く', () => {
    process.env.YTDLP_JS_RUNTIME = 'node';
    const args = buildSubtitleArgs('https://youtu.be/jNQXAC9IVRw', 'en', 'C:/tmp/yt');
    expect(args[args.indexOf('--js-runtimes') + 1]).toBe('node');
  });
});

describe('summarizeYtdlpError', () => {
  it('ERROR 行だけを抽出して接頭辞を落とす', () => {
    const stderr = [
      'WARNING: something',
      '[youtube] Extracting URL',
      'ERROR: [youtube] jNQXAC9IVRw: Video unavailable',
    ].join('\n');
    expect(summarizeYtdlpError(stderr)).toBe('[youtube] jNQXAC9IVRw: Video unavailable');
  });

  it('ERROR 行が無ければ空文字を返す', () => {
    expect(summarizeYtdlpError('all good')).toBe('');
  });
});
