import { describe, it, expect } from 'vitest';
import {
  AUDIO_EXT,
  AUDIO_MIME,
  decodeUploadFileName,
  getAudioMaxMb,
  isSupportedAudio,
} from '../utils/audioUpload';

describe('isSupportedAudio', () => {
  it('mp3 / wav / m4a を受け付ける', () => {
    expect(isSupportedAudio({ mimetype: 'audio/mpeg', originalname: 'sample.mp3' })).toBe(true);
    expect(isSupportedAudio({ mimetype: 'audio/wav', originalname: 'sample.wav' })).toBe(true);
    expect(isSupportedAudio({ mimetype: 'audio/x-m4a', originalname: 'sample.M4A' })).toBe(true);
  });

  it('実行ファイルやテキストを拒否する', () => {
    expect(isSupportedAudio({ mimetype: 'application/octet-stream', originalname: 'evil.exe' })).toBe(false);
    expect(isSupportedAudio({ mimetype: 'text/plain', originalname: 'note.txt' })).toBe(false);
  });

  it('拡張子だけ・MIME だけが音声のものは拒否する', () => {
    expect(isSupportedAudio({ mimetype: 'audio/mpeg', originalname: 'sample.exe' })).toBe(false);
    expect(isSupportedAudio({ mimetype: 'application/pdf', originalname: 'sample.mp3' })).toBe(false);
  });

  it('application/octet-stream でも拡張子が音声なら受け付ける', () => {
    expect(isSupportedAudio({ mimetype: 'application/octet-stream', originalname: 'sample.wav' })).toBe(true);
    expect(isSupportedAudio({ mimetype: 'application/octet-stream', originalname: 'sample.exe' })).toBe(false);
  });
});

describe('定数', () => {
  it('代表的な音声 MIME を含む', () => {
    expect(AUDIO_MIME.has('audio/mpeg')).toBe(true);
    expect(AUDIO_MIME.has('audio/webm')).toBe(true);
  });

  it('拡張子の正規表現が代表形式にマッチする', () => {
    for (const name of ['a.mp3', 'b.m4a', 'c.wav', 'd.ogg', 'e.opus', 'f.webm', 'g.flac']) {
      expect(AUDIO_EXT.test(name)).toBe(true);
    }
    expect(AUDIO_EXT.test('a.txt')).toBe(false);
  });

  it('上限サイズの既定値は 100MB', () => {
    delete process.env.AUDIO_MAX_MB;
    expect(getAudioMaxMb()).toBe(100);
  });
});

describe('decodeUploadFileName', () => {
  it('ASCII のファイル名はそのまま返す', () => {
    expect(decodeUploadFileName('sample-01.mp3')).toBe('sample-01.mp3');
  });

  it('latin1 として復号された日本語ファイル名を UTF-8 に戻す', () => {
    const latin1 = Buffer.from('日本語の音声.mp3', 'utf8').toString('latin1');
    expect(decodeUploadFileName(latin1)).toBe('日本語の音声.mp3');
  });

  it('すでに Unicode のファイル名は壊さない', () => {
    expect(decodeUploadFileName('日本語の音声.mp3')).toBe('日本語の音声.mp3');
  });
});
