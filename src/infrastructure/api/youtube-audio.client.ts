/**
 * YouTube Audio Download Client
 *
 * Downloads audio-only streams from YouTube using @distube/ytdl-core (pure JS).
 * Used for captionless YouTube videos whose audio has to be transcribed by Deepgram.
 *
 * @see https://github.com/distubejs/ytdl-core
 */

import ytdl from '@distube/ytdl-core';
import type { Readable } from 'stream';

export interface AudioDownloadResult {
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number;
  format: string;
}

export interface AudioStreamResult {
  stream: Readable;
  mimeType: string;
  durationSeconds: number;
  format: string;
  /** Best-effort total size in bytes from ytdl-core format metadata; may be undefined. */
  bytesTotal?: number;
}

const DOWNLOAD_TIMEOUT_MS = 120_000; // 2 min max for download
const MIN_AUDIO_BITRATE_KBPS = 32; // Deepgram transcribes 32+ kbps speech indistinguishably from 160 kbps

const MIME_MAP: Record<string, string> = {
  webm: 'audio/webm',
  mp4: 'audio/mp4',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
};

type YtdlFormat = ytdl.videoFormat;

/**
 * Select the lowest-bitrate audio-only format at or above {@link MIN_AUDIO_BITRATE_KBPS}.
 *
 * Preference order:
 *   1. Opus / WebM at the lowest bitrate ≥ 32 kbps
 *   2. m4a at the lowest bitrate ≥ 32 kbps
 *   3. Any other audio-only format at the lowest bitrate ≥ 32 kbps
 *
 * Rationale: Deepgram Nova-3 transcribes 48 kbps Opus indistinguishably from 160 kbps
 * for speech. Grabbing the smallest acceptable stream cuts download time, memory, and
 * upstream POST size without any measurable accuracy loss.
 */
export function selectAudioFormat(formats: YtdlFormat[]): YtdlFormat {
  const audioOnly = formats.filter((f) => f.hasAudio && !f.hasVideo);
  if (audioOnly.length === 0) {
    throw new Error('No audio-only formats available for this video');
  }

  const acceptable = audioOnly.filter((f) => (f.audioBitrate ?? 0) >= MIN_AUDIO_BITRATE_KBPS);
  if (acceptable.length === 0) {
    throw new Error(
      `No audio-only formats at or above ${MIN_AUDIO_BITRATE_KBPS} kbps for this video`
    );
  }

  const byAscendingBitrate = (a: YtdlFormat, b: YtdlFormat) =>
    (a.audioBitrate ?? Number.POSITIVE_INFINITY) - (b.audioBitrate ?? Number.POSITIVE_INFINITY);

  const isOpus = (f: YtdlFormat) =>
    f.container === 'webm' || f.codecs?.toLowerCase().includes('opus');
  // ytdl-core reports m4a streams as container === 'mp4' with an mp4a codec.
  const isM4a = (f: YtdlFormat) =>
    f.container === 'mp4' || f.codecs?.toLowerCase().includes('mp4a');

  const opus = acceptable.filter(isOpus).sort(byAscendingBitrate);
  if (opus.length > 0) return opus[0];

  const m4a = acceptable.filter(isM4a).sort(byAscendingBitrate);
  if (m4a.length > 0) return m4a[0];

  return [...acceptable].sort(byAscendingBitrate)[0];
}

function mimeTypeFor(format: YtdlFormat): string {
  const container = format.container ?? 'webm';
  return MIME_MAP[container] ?? `audio/${container}`;
}

function parseBytesTotal(format: YtdlFormat): number | undefined {
  const raw = (format as { contentLength?: string | number }).contentLength;
  if (raw == null) return undefined;
  const n = typeof raw === 'number' ? raw : parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Download audio-only from a YouTube video and return a Buffer with metadata.
 *
 * Thin wrapper over {@link downloadYoutubeAudioStream} that drains the stream
 * into memory. Kept for callers and tests that need the legacy buffer shape;
 * prefer the streaming variant for the production transcription path.
 */
export async function downloadYoutubeAudio(
  youtubeUrl: string,
  options?: { maxDurationSeconds?: number }
): Promise<AudioDownloadResult> {
  const streamResult = await downloadYoutubeAudioStream(youtubeUrl, options);
  const startDl = Date.now();
  const buffer = await streamToBuffer(streamResult.stream, DOWNLOAD_TIMEOUT_MS);
  const dlTime = Date.now() - startDl;

  console.log(
    `[Audio] Download complete (buffered): ${(buffer.length / 1024 / 1024).toFixed(1)} MB ` +
      `${streamResult.format} in ${(dlTime / 1000).toFixed(1)}s`
  );

  return {
    buffer,
    mimeType: streamResult.mimeType,
    sizeBytes: buffer.length,
    durationSeconds: streamResult.durationSeconds,
    format: streamResult.format,
  };
}

/**
 * Download audio-only from a YouTube video and return a Readable stream.
 *
 * The stream is piped directly from ytdl-core — no buffering. Callers are
 * responsible for consuming it (e.g. passing it as a streaming fetch body
 * to Deepgram) and for destroying it on cancellation.
 */
export async function downloadYoutubeAudioStream(
  youtubeUrl: string,
  options?: { maxDurationSeconds?: number }
): Promise<AudioStreamResult> {
  const info = await ytdl.getInfo(youtubeUrl);
  const durationSeconds = parseInt(info.videoDetails.lengthSeconds, 10) || 0;

  if (options?.maxDurationSeconds && durationSeconds > options.maxDurationSeconds) {
    throw new Error(
      `Video too long (${Math.ceil(durationSeconds / 60)} min). ` +
        `Maximum is ${Math.ceil(options.maxDurationSeconds / 60)} minutes.`
    );
  }

  const chosen = selectAudioFormat(info.formats);
  const container = chosen.container ?? 'webm';
  const mimeType = mimeTypeFor(chosen);
  const bytesTotal = parseBytesTotal(chosen);

  console.log(
    `[Audio] Streaming audio: ${youtubeUrl} | duration=${Math.ceil(
      durationSeconds / 60
    )}min | format=${container} | bitrate=${chosen.audioBitrate ?? '?'}kbps` +
      (bytesTotal ? ` | bytes=${bytesTotal}` : '')
  );

  const stream = ytdl.downloadFromInfo(info, { format: chosen });

  return {
    stream,
    mimeType,
    durationSeconds,
    format: container,
    bytesTotal,
  };
}

/**
 * Collect a readable stream into a Buffer with a timeout.
 */
function streamToBuffer(stream: Readable, timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      stream.destroy(new Error('Download timed out'));
      reject(new Error(`Audio download timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    });
    stream.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Audio stream error: ${err.message}`));
    });
  });
}
