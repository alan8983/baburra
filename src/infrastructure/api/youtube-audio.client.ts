/**
 * YouTube Audio Download Client
 *
 * Downloads audio-only streams from YouTube using yt-dlp.
 * Used for long videos (>30 min) where Gemini's direct file_uri approach fails.
 *
 * @see https://github.com/yt-dlp/yt-dlp
 */

import { execSync } from 'child_process';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';

/**
 * Resolve the yt-dlp binary path.
 * In production (Vercel), the binary is bundled by yt-dlp-exec at install time.
 * Supports override via YTDLP_PATH environment variable.
 *
 * Note: We use require.resolve() to find the package location because Next.js
 * webpack bundles `require()` calls and changes the CWD context, making
 * `require('yt-dlp-exec/src/constants').YOUTUBE_DL_PATH` resolve to the
 * .next/dev/server/ directory instead of node_modules/.
 */
function getYtdlpPath(): string {
  if (process.env.YTDLP_PATH) {
    return process.env.YTDLP_PATH;
  }

  // Use process.cwd() to find node_modules at runtime.
  // require.resolve() gets webpack-bundled in Next.js and resolves to (rsc)/...
  const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  return join(process.cwd(), 'node_modules', 'yt-dlp-exec', 'bin', binaryName);
}

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
 * Uses yt-dlp to extract the best audio stream (preferring m4a for Gemini compatibility).
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
  const ytdlpPath = getYtdlpPath();

  if (!existsSync(ytdlpPath)) {
    throw new Error(`yt-dlp binary not found at: ${ytdlpPath}`);
  }

  // Step 1: Get video info (duration check)
  const infoJson = execSync(`"${ytdlpPath}" --dump-json --no-download "${youtubeUrl}"`, {
    encoding: 'utf-8',
    timeout: 30_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const info = JSON.parse(infoJson) as {
    duration: number;
    title: string;
    id: string;
  };

  if (options?.maxDurationSeconds && info.duration > options.maxDurationSeconds) {
    throw new Error(
      `Video too long (${Math.ceil(info.duration / 60)} min). ` +
        `Maximum is ${Math.ceil(options.maxDurationSeconds / 60)} minutes.`
    );
  }

  // Step 2: Download audio-only
  // Prefer Opus/WebM (~50% smaller than m4a, no transcoding needed), fall back to any audio
  const tmpFile = join(tmpdir(), `baburra-audio-${Date.now()}-${info.id}`);
  const startDl = Date.now();

  try {
    console.log(
      `[Audio] Downloading audio: ${youtubeUrl} | duration=${Math.ceil(info.duration / 60)}min`
    );

    execSync(
      `"${ytdlpPath}" -f "bestaudio[acodec=opus]/bestaudio" --no-playlist -o "${tmpFile}.%(ext)s" "${youtubeUrl}"`,
      { encoding: 'utf-8', timeout: DOWNLOAD_TIMEOUT_MS, stdio: ['pipe', 'pipe', 'pipe'] }
    );

    const dlTime = Date.now() - startDl;

    // Find the output file (extension is determined by yt-dlp based on available formats)
    const extMimeMap: [string, string][] = [
      ['m4a', 'audio/mp4'],
      ['webm', 'audio/webm'],
      ['opus', 'audio/opus'],
      ['ogg', 'audio/ogg'],
      ['mp3', 'audio/mpeg'],
      ['wav', 'audio/wav'],
    ];

    let audioFile: string | null = null;
    let mimeType: string = 'audio/mp4';
    let ext: string = 'm4a';

    for (const [e, mime] of extMimeMap) {
      const path = `${tmpFile}.${e}`;
      if (existsSync(path)) {
        audioFile = path;
        mimeType = mime;
        ext = e;
        break;
      }
    }

    if (!audioFile) {
      throw new Error('yt-dlp produced no output file');
    }

    const buffer = readFileSync(audioFile);
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);

    console.log(`[Audio] Download complete: ${sizeMB} MB ${ext} in ${(dlTime / 1000).toFixed(1)}s`);

    // Cleanup temp file
    try {
      unlinkSync(audioFile);
    } catch {
      // Best effort cleanup
    }

    return {
      buffer,
      mimeType,
      sizeBytes: buffer.length,
      durationSeconds: info.duration,
      format: ext,
    };
  } catch (error) {
    // Cleanup temp files on failure
    const possibleExts = ['m4a', 'webm', 'opus', 'ogg', 'mp3', 'wav'];
    for (const e of possibleExts) {
      const path = `${tmpFile}.${e}`;
      if (existsSync(path)) {
        try {
          unlinkSync(path);
        } catch {
          // Best effort
        }
      }
    }

    if (error instanceof Error && error.message.includes('Video too long')) {
      throw error;
    }

    throw new Error(
      `Failed to download audio from ${youtubeUrl}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
