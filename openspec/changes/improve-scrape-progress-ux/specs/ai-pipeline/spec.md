## MODIFIED Requirements

### Requirement: Long-video scrape concurrency is bounded, not serialized
The system SHALL process YouTube URLs within a scrape job concurrently, up to a bounded limit controlled by the `YOUTUBE_SCRAPE_CONCURRENCY` environment variable (default `3`, allowed range `[1, 5]`). The previous behavior of forcing `effectiveBatchSize = 1` for any job touching YouTube URLs is removed.

#### Scenario: Default concurrency of 3
- **WHEN** a scrape job contains 10 captionless YouTube URLs and `YOUTUBE_SCRAPE_CONCURRENCY` is unset
- **THEN** `processJobBatch` SHALL have at most 3 `processUrl` invocations in flight at any time
- **AND** the job SHALL complete in roughly one third of the wall-clock time of the previous serial behavior for equivalent inputs

#### Scenario: Environment override
- **WHEN** `YOUTUBE_SCRAPE_CONCURRENCY=1` is set
- **THEN** `processJobBatch` SHALL process YouTube URLs strictly serially (matching the old behavior for rollback)

#### Scenario: Clamp out-of-range values
- **WHEN** `YOUTUBE_SCRAPE_CONCURRENCY=99` is set
- **THEN** the effective concurrency SHALL be clamped to 5

### Requirement: Audio downloads prefer the lowest-viable bitrate
The YouTube audio downloader SHALL select audio-only formats with `audioBitrate >= 32` kbps, preferring the **lowest** matching bitrate and the `webm` / `opus` container when available. Only when no Opus format meets the floor SHALL the downloader fall back to `m4a`. The previous "highest bitrate first" selection is removed.

#### Scenario: Lowest-bitrate Opus is selected
- **WHEN** a video exposes Opus formats at 48, 96, and 160 kbps
- **THEN** the downloader SHALL select the 48 kbps Opus format

#### Scenario: Fall back to m4a when Opus is unavailable
- **WHEN** a video exposes only `m4a` audio formats
- **THEN** the downloader SHALL select the lowest-bitrate `m4a` format ≥ 32 kbps

#### Scenario: No acceptable formats
- **WHEN** a video exposes no audio-only formats at or above 32 kbps
- **THEN** the downloader SHALL throw an error with a clear message instead of silently falling back to video

### Requirement: Download and transcription stages overlap via streaming
The YouTube audio downloader SHALL expose a streaming variant (`downloadYoutubeAudioStream`) returning a Node `Readable` stream of audio bytes and the known `bytesTotal` when available. The Deepgram client SHALL accept either a `Buffer` or a `Readable` body; when given a stream, it SHALL POST with `duplex: 'half'` so the HTTP request body is transmitted incrementally as bytes arrive from the downloader.

#### Scenario: Streaming path emits bytes before the download completes
- **WHEN** `transcribeAudio` is invoked on a 60-min long video with `DEEPGRAM_STREAMING_BODY=true`
- **THEN** the Deepgram POST request body SHALL begin transmission while ytdl-core is still downloading, and the end-to-end wall-clock time SHALL be less than the sum of a full buffered-download phase plus a full buffered-POST phase

#### Scenario: Buffer path remains available
- **WHEN** `DEEPGRAM_STREAMING_BODY=false` is set
- **THEN** `transcribeAudio` SHALL silently drain the stream into a buffer and use the existing buffered POST path, preserving the previous behavior byte-for-byte

#### Scenario: Retry after streaming failure falls back to buffer
- **WHEN** a streaming Deepgram POST fails with a retryable error
- **THEN** the retry attempt SHALL use the buffered path (streams are single-use) and the retry budget SHALL be unchanged

### Requirement: Pipeline emits stage callbacks during URL processing
`processUrl` in `import-pipeline.service.ts` SHALL accept an optional `onStage(stage, meta?)` callback and invoke it at each pipeline boundary in the order: `discovering` → `downloading` → `transcribing` → `analyzing` → `done` (or `failed` on any failure). During the `downloading` stage the callback SHALL additionally receive `{ bytesDownloaded, bytesTotal }` updates throttled to no more than one update per 1 MB of progress. When `onStage` is not supplied, `processUrl` SHALL behave exactly as before.

#### Scenario: Happy-path callback sequence
- **WHEN** `processUrl` runs successfully on a captionless long video with `onStage` supplied
- **THEN** `onStage` SHALL be called with stages `discovering`, `downloading`, `transcribing`, `analyzing`, `done` in that order, with at least one `downloading` call carrying `bytesDownloaded > 0`

#### Scenario: Failure emits `failed` with error message
- **WHEN** `processUrl` fails during transcription
- **THEN** `onStage` SHALL be called one final time with `stage = 'failed'` and `meta.errorMessage` populated with the failure reason

#### Scenario: Callback is optional
- **WHEN** `processUrl` is called without `onStage`
- **THEN** the pipeline SHALL run to completion with no observable behavioral difference compared to the previous implementation
