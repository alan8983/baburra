/**
 * YouTube Audio Download Client
 *
 * Downloads audio-only streams from YouTube using @distube/ytdl-core (pure JS).
 * Used for long videos (>30 min) where Gemini's direct file_uri approach fails.
 *
 * @see https://github.com/distubejs/ytdl-core
 */

import ytdl from '@distube/ytdl-core';

export interface AudioDownloadResult {
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number;
  format: string;
}

const DOWNLOAD_TIMEOUT_MS = 120_000; // 2 min max for download

/**
 * Download audio-only from a YouTube video.
 *
 * Uses @distube/ytdl-core to extract the best audio stream.
 * Returns the audio as a Buffer with metadata.
 *
 * @param youtubeUrl - Full YouTube video URL
 * @param options - Optional configuration
 * @returns Audio buffer with metadata
 */
export async function downloadYoutubeAudio(
  youtubeUrl: string,
  options?: { maxDurationSeconds?: number }
): Promise<AudioDownloadResult> {
  // Step 1: Get video info (duration check)
  const info = await ytdl.getInfo(youtubeUrl);
  const durationSeconds = parseInt(info.videoDetails.lengthSeconds, 10) || 0;

  if (options?.maxDurationSeconds && durationSeconds > options.maxDurationSeconds) {
    throw new Error(
      `Video too long (${Math.ceil(durationSeconds / 60)} min). ` +
        `Maximum is ${Math.ceil(options.maxDurationSeconds / 60)} minutes.`
    );
  }

  // Step 2: Pick the best audio-only format
  const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
  if (audioFormats.length === 0) {
    throw new Error('No audio-only formats available for this video');
  }

  // Prefer highest bitrate audio
  const chosen = audioFormats.sort((a, b) => (b.audioBitrate ?? 0) - (a.audioBitrate ?? 0))[0];

  const container = chosen.container ?? 'webm';
  const mimeMap: Record<string, string> = {
    webm: 'audio/webm',
    mp4: 'audio/mp4',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    mp3: 'audio/mpeg',
  };
  const mimeType = mimeMap[container] ?? `audio/${container}`;

  // Step 3: Download audio stream → Buffer
  console.log(
    `[Audio] Downloading audio: ${youtubeUrl} | duration=${Math.ceil(durationSeconds / 60)}min | format=${container}`
  );

  const startDl = Date.now();
  const buffer = await streamToBuffer(
    ytdl.downloadFromInfo(info, { format: chosen }),
    DOWNLOAD_TIMEOUT_MS
  );
  const dlTime = Date.now() - startDl;
  const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);

  console.log(
    `[Audio] Download complete: ${sizeMB} MB ${container} in ${(dlTime / 1000).toFixed(1)}s`
  );

  return {
    buffer,
    mimeType,
    sizeBytes: buffer.length,
    durationSeconds,
    format: container,
  };
}

/**
 * Collect a readable stream into a Buffer with a timeout.
 */
function streamToBuffer(stream: import('stream').Readable, timeoutMs: number): Promise<Buffer> {
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
