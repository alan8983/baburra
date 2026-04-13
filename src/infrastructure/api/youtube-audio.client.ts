/**
 * YouTube Audio Download Client
 *
 * Downloads audio-only streams from YouTube. Uses @distube/ytdl-core as the
 * fast path (pure JS, no binary) and falls back to yt-dlp-exec (bundled binary)
 * when ytdl-core fails — which happens frequently when YouTube changes its
 * page structure.
 *
 * @see https://github.com/distubejs/ytdl-core
 * @see https://github.com/microlinkhq/yt-dlp-exec
 */

import ytdl from '@distube/ytdl-core';
// yt-dlp-exec default export is a promise-based wrapper; .exec returns an ExecaChildProcess.
// We use the default (async) variant which resolves to { stdout, stderr }.
import ytDlpDefault from 'yt-dlp-exec';
import { createReadStream, existsSync, unlinkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

// ── Fast path: @distube/ytdl-core (pure JS) ──

async function downloadWithYtdlCore(
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
    `[Audio] ytdl-core streaming: ${youtubeUrl} | duration=${Math.ceil(
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

// ── Reliable fallback: yt-dlp binary ──

function cleanupTmpFile(filePath: string): void {
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    // Best-effort cleanup
  }
}

async function downloadWithYtDlp(
  youtubeUrl: string,
  options?: { maxDurationSeconds?: number }
): Promise<AudioStreamResult> {
  // 1. Get video info (duration) via --dump-json
  // The default export with dumpJson returns a parsed YtResponse object.
  const info = await ytDlpDefault(youtubeUrl, {
    dumpJson: true,
    noPlaylist: true,
  });
  const durationSeconds: number = info.duration ?? 0;

  if (options?.maxDurationSeconds && durationSeconds > options.maxDurationSeconds) {
    throw new Error(
      `Video too long (${Math.ceil(durationSeconds / 60)} min). ` +
        `Maximum is ${Math.ceil(options.maxDurationSeconds / 60)} minutes.`
    );
  }

  // 2. Download audio to temp file
  const tmpFile = join(
    tmpdir(),
    `ytdlp-audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webm`
  );

  console.log(
    `[Audio] yt-dlp downloading: ${youtubeUrl} | duration=${Math.ceil(durationSeconds / 60)}min → ${tmpFile}`
  );

  await ytDlpDefault(youtubeUrl, {
    format: 'bestaudio[ext=webm]/bestaudio',
    noPlaylist: true,
    output: tmpFile,
  });

  // Determine actual file extension (yt-dlp may append its own)
  // yt-dlp with -o writes to the exact path for webm, but may add .part during download
  if (!existsSync(tmpFile)) {
    // Check if yt-dlp wrote with a different extension
    const possibleExts = ['.webm', '.m4a', '.opus', '.mp4'];
    const base = tmpFile.replace(/\.webm$/, '');
    let actualFile: string | null = null;
    for (const ext of possibleExts) {
      if (existsSync(base + ext)) {
        actualFile = base + ext;
        break;
      }
    }
    if (!actualFile) {
      throw new Error(`yt-dlp download produced no output file at ${tmpFile}`);
    }
    // Use the actual file
    return buildStreamResult(actualFile, durationSeconds);
  }

  return buildStreamResult(tmpFile, durationSeconds);
}

function buildStreamResult(filePath: string, durationSeconds: number): AudioStreamResult {
  const stat = statSync(filePath);
  const ext = filePath.split('.').pop() ?? 'webm';
  const mimeType = MIME_MAP[ext] ?? 'audio/webm';

  console.log(
    `[Audio] yt-dlp download complete: ${(stat.size / 1024 / 1024).toFixed(1)} MB ${ext}`
  );

  const stream = createReadStream(filePath);

  // Auto-cleanup temp file when stream is consumed or destroyed
  const cleanup = () => cleanupTmpFile(filePath);
  stream.once('end', cleanup);
  stream.once('error', cleanup);
  stream.once('close', cleanup);

  return {
    stream,
    mimeType,
    durationSeconds,
    format: ext,
    bytesTotal: stat.size,
  };
}

// ── Public API ──

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
 * Tries @distube/ytdl-core first (fast, pure JS). If that fails — which
 * happens when YouTube changes its page structure — falls back to yt-dlp
 * binary via yt-dlp-exec.
 *
 * Callers are responsible for consuming the stream and for destroying it
 * on cancellation.
 */
export async function downloadYoutubeAudioStream(
  youtubeUrl: string,
  options?: { maxDurationSeconds?: number }
): Promise<AudioStreamResult> {
  // Fast path: @distube/ytdl-core (pure JS, no binary spawn)
  try {
    return await downloadWithYtdlCore(youtubeUrl, options);
  } catch (ytdlErr) {
    const msg = ytdlErr instanceof Error ? ytdlErr.message : String(ytdlErr);
    // Don't fall back for duration limit errors — those are intentional rejections
    if (msg.includes('Video too long')) throw ytdlErr;
    console.warn(`[Audio] ytdl-core failed, falling back to yt-dlp: ${msg}`);
  }

  // Reliable fallback: yt-dlp binary
  return await downloadWithYtDlp(youtubeUrl, options);
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
