/**
 * Gemini File API Client
 *
 * Handles uploading files to Google's Gemini File API and cleanup.
 * Used for long video transcription where direct YouTube URL approach fails.
 *
 * @see https://ai.google.dev/gemini-api/docs/files
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com';
const UPLOAD_TIMEOUT_MS = 120_000; // 2 min for upload
const FILE_POLL_INTERVAL_MS = 2_000; // 2s between state polls
const FILE_POLL_MAX_ATTEMPTS = 30; // Max 60s of polling

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  return apiKey;
}

export interface GeminiFileUploadResult {
  fileUri: string;
  fileName: string; // e.g., "files/abc123"
  state: string;
  sizeBytes: number;
}

/**
 * Upload a file to Gemini File API using the resumable upload protocol.
 *
 * Flow:
 * 1. Initiate resumable upload → get upload URL
 * 2. Upload file data → get file metadata with URI
 * 3. Poll until state is ACTIVE (usually immediate for audio)
 *
 * @param buffer - File data as Buffer
 * @param mimeType - MIME type (e.g., 'audio/mp4', 'audio/webm')
 * @param displayName - Human-readable name for the file
 * @returns File URI and metadata
 */
export async function uploadToGeminiFiles(
  buffer: Buffer,
  mimeType: string,
  displayName: string
): Promise<GeminiFileUploadResult> {
  const apiKey = getApiKey();

  console.log(
    `[Gemini] Uploading file to Gemini Files API: ${displayName} (${(buffer.length / 1024 / 1024).toFixed(1)} MB, ${mimeType})`
  );

  // Step 1: Initiate resumable upload
  const initController = new AbortController();
  const initTimeoutId = setTimeout(() => initController.abort(), 30_000);

  let initRes: Response;
  try {
    initRes = await fetch(`${GEMINI_BASE}/upload/v1beta/files?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(buffer.length),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file: { displayName },
      }),
      signal: initController.signal,
    });
  } finally {
    clearTimeout(initTimeoutId);
  }

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`Gemini File API upload init failed ${initRes.status}: ${errText}`);
  }

  const uploadUrl = initRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    throw new Error('Gemini File API did not return upload URL');
  }

  // Step 2: Upload the actual file data
  const uploadController = new AbortController();
  const uploadTimeoutId = setTimeout(() => uploadController.abort(), UPLOAD_TIMEOUT_MS);

  let uploadRes: Response;
  try {
    uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(buffer.length),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
        // Force connection close after upload to prevent Node.js undici from
        // reusing the socket for the subsequent generateContent request.
        // Without this, undici can assign the next fetch to a stale socket that
        // the server has already closed, causing "SocketError: other side closed".
        // See: https://github.com/nodejs/undici/issues/3492
        Connection: 'close',
      },
      body: new Uint8Array(buffer),
      signal: uploadController.signal,
    });
  } finally {
    clearTimeout(uploadTimeoutId);
  }

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Gemini File API upload failed ${uploadRes.status}: ${errText}`);
  }

  const uploadData = (await uploadRes.json()) as {
    file?: {
      name: string;
      uri: string;
      state: string;
      sizeBytes: string;
    };
  };

  if (!uploadData.file?.uri || !uploadData.file?.name) {
    throw new Error('Gemini File API upload returned no file metadata');
  }

  const { name: fileName, uri: fileUri, state } = uploadData.file;
  const sizeBytes = parseInt(uploadData.file.sizeBytes, 10);

  console.log(`[Gemini] File uploaded: ${fileName} (state: ${state})`);

  // Step 3: Poll until ACTIVE if still PROCESSING
  if (state === 'PROCESSING') {
    console.log(`[Gemini] File is PROCESSING, polling until ACTIVE...`);

    for (let i = 0; i < FILE_POLL_MAX_ATTEMPTS; i++) {
      await new Promise((resolve) => setTimeout(resolve, FILE_POLL_INTERVAL_MS));

      const checkRes = await fetch(`${GEMINI_BASE}/v1beta/${fileName}?key=${apiKey}`);
      if (!checkRes.ok) {
        console.warn(`[Gemini] File state check failed: ${checkRes.status}`);
        continue;
      }

      const checkData = (await checkRes.json()) as { state: string };
      if (checkData.state === 'ACTIVE') {
        console.log(`[Gemini] File now ACTIVE after ${((i + 1) * FILE_POLL_INTERVAL_MS) / 1000}s`);
        break;
      }

      if (checkData.state === 'FAILED') {
        throw new Error(`Gemini File API: file processing failed for ${fileName}`);
      }
    }
  }

  return { fileUri, fileName, state: 'ACTIVE', sizeBytes };
}

/**
 * Delete a file from Gemini File API.
 * Best-effort cleanup — files auto-expire after 48 hours anyway.
 *
 * @param fileName - File name (e.g., "files/abc123")
 */
export async function deleteGeminiFile(fileName: string): Promise<void> {
  const apiKey = getApiKey();

  try {
    const res = await fetch(`${GEMINI_BASE}/v1beta/${fileName}?key=${apiKey}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      console.log(`[Gemini] File cleanup: ${fileName} deleted`);
    } else {
      console.warn(`[Gemini] File cleanup failed for ${fileName}: ${res.status}`);
    }
  } catch (error) {
    console.warn(
      `[Gemini] File cleanup error for ${fileName}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
