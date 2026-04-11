import { describe, it, expect } from 'vitest';
import { selectAudioFormat } from '../youtube-audio.client';

// Minimal shape that matches what ytdl-core gives us for the fields we read.
type Fmt = {
  itag: number;
  container: string;
  codecs?: string;
  audioBitrate?: number;
  hasAudio: boolean;
  hasVideo: boolean;
};

const fmt = (partial: Partial<Fmt> & { container: string; audioBitrate?: number }): Fmt => ({
  itag: 0,
  hasAudio: true,
  hasVideo: false,
  ...partial,
});

describe('selectAudioFormat', () => {
  it('picks the lowest-bitrate Opus format that meets the 32 kbps floor', () => {
    const formats = [
      fmt({ container: 'webm', codecs: 'opus', audioBitrate: 160 }),
      fmt({ container: 'webm', codecs: 'opus', audioBitrate: 48 }),
      fmt({ container: 'webm', codecs: 'opus', audioBitrate: 96 }),
    ];

    const chosen = selectAudioFormat(formats as unknown as Parameters<typeof selectAudioFormat>[0]);

    expect(chosen.audioBitrate).toBe(48);
    expect(chosen.container).toBe('webm');
  });

  it('prefers Opus over m4a even when m4a is lower bitrate', () => {
    const formats = [
      fmt({ container: 'mp4', codecs: 'mp4a.40.2', audioBitrate: 32 }),
      fmt({ container: 'webm', codecs: 'opus', audioBitrate: 48 }),
      fmt({ container: 'webm', codecs: 'opus', audioBitrate: 96 }),
    ];

    const chosen = selectAudioFormat(formats as unknown as Parameters<typeof selectAudioFormat>[0]);

    expect(chosen.container).toBe('webm');
    expect(chosen.audioBitrate).toBe(48);
  });

  it('falls back to m4a when no Opus is available', () => {
    const formats = [
      fmt({ container: 'mp4', codecs: 'mp4a.40.2', audioBitrate: 128 }),
      fmt({ container: 'mp4', codecs: 'mp4a.40.2', audioBitrate: 48 }),
    ];

    const chosen = selectAudioFormat(formats as unknown as Parameters<typeof selectAudioFormat>[0]);

    expect(chosen.container).toBe('mp4');
    expect(chosen.audioBitrate).toBe(48);
  });

  it('drops formats below the 32 kbps floor', () => {
    const formats = [
      fmt({ container: 'webm', codecs: 'opus', audioBitrate: 16 }),
      fmt({ container: 'webm', codecs: 'opus', audioBitrate: 48 }),
    ];

    const chosen = selectAudioFormat(formats as unknown as Parameters<typeof selectAudioFormat>[0]);

    expect(chosen.audioBitrate).toBe(48);
  });

  it('throws when no audio-only formats exist', () => {
    const formats = [fmt({ container: 'webm', hasAudio: false, hasVideo: true })];

    expect(() =>
      selectAudioFormat(formats as unknown as Parameters<typeof selectAudioFormat>[0])
    ).toThrow(/no audio-only formats/i);
  });

  it('throws when every audio format is below the bitrate floor', () => {
    const formats = [
      fmt({ container: 'webm', codecs: 'opus', audioBitrate: 16 }),
      fmt({ container: 'mp4', codecs: 'mp4a.40.2', audioBitrate: 24 }),
    ];

    expect(() =>
      selectAudioFormat(formats as unknown as Parameters<typeof selectAudioFormat>[0])
    ).toThrow(/at or above 32 kbps/i);
  });

  it('falls back to another audio format when neither Opus nor m4a is available', () => {
    const formats = [
      fmt({ container: 'ogg', codecs: 'vorbis', audioBitrate: 64 }),
      fmt({ container: 'ogg', codecs: 'vorbis', audioBitrate: 96 }),
    ];

    const chosen = selectAudioFormat(formats as unknown as Parameters<typeof selectAudioFormat>[0]);

    expect(chosen.container).toBe('ogg');
    expect(chosen.audioBitrate).toBe(64);
  });
});
