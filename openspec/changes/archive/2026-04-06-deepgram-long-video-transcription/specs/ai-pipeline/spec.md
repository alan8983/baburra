## MODIFIED Requirements

### Requirement: Long video transcription path

The import pipeline SHALL use **Deepgram Nova-2** (not Gemini File API) for transcribing captionless YouTube videos longer than 30 minutes. The flow SHALL be:

1. Download audio-only via yt-dlp (preferring Opus/WebM format)
2. POST audio buffer to Deepgram `POST /v1/listen`
3. Receive transcript with timestamps and speaker diarization
4. Pass transcript to Gemini `analyzeDraftContent()` for sentiment/ticker analysis

The pipeline SHALL NOT use `gemini-file.client.ts` or `geminiTranscribeAudio()` — these are removed.

#### Scenario: Long captionless video (>30 min) imports successfully
- **WHEN** a YouTube URL is imported with duration >30 minutes and no captions available
- **THEN** the pipeline downloads audio via yt-dlp, transcribes via Deepgram, and produces a post with sentiment analysis and tickers

#### Scenario: Short captionless video (≤30 min) uses existing Gemini path
- **WHEN** a YouTube URL is imported with duration ≤30 minutes and no captions available
- **THEN** the pipeline uses Gemini `file_uri` direct transcription (unchanged behavior)

#### Scenario: Captioned video uses caption extraction path
- **WHEN** a YouTube URL is imported and captions are available
- **THEN** the pipeline uses `youtube-transcript-plus` caption extraction regardless of duration (unchanged behavior)

#### Scenario: Transcript cache hit skips Deepgram
- **WHEN** a YouTube URL has been previously transcribed and the transcript is cached
- **THEN** the cached transcript is reused without calling Deepgram or downloading audio

### Requirement: Audio format preference

The `youtube-audio.client.ts` module SHALL prefer **Opus in WebM container** when downloading audio from YouTube. If Opus is not available, it SHALL fall back to best available audio format.

#### Scenario: Opus available on YouTube
- **WHEN** YouTube offers an Opus audio stream for the video
- **THEN** yt-dlp downloads Opus/WebM (no transcoding)

#### Scenario: Opus not available
- **WHEN** YouTube does not offer Opus for a specific video
- **THEN** yt-dlp falls back to best available audio (typically m4a/AAC)

### Requirement: Scrape pipeline compatibility

When a scrape job processes multiple YouTube videos sequentially, each long video SHALL be transcribed independently via Deepgram without affecting subsequent requests in the same job.

#### Scenario: Scrape job with multiple long videos
- **WHEN** a scrape job queues 5 captionless YouTube videos, each >30 minutes
- **THEN** all 5 are transcribed successfully via Deepgram in sequence, no socket or connection errors between requests

#### Scenario: Mixed scrape job (long + short + captioned)
- **WHEN** a scrape job contains a mix of long captionless, short captionless, and captioned videos
- **THEN** each video uses the correct pipeline path: Deepgram for long captionless, Gemini `file_uri` for short captionless, caption extraction for captioned

## REMOVED Requirements

### Requirement: Gemini File API upload for audio transcription
**Reason**: Google server-side stale socket bug makes all HTTPS connections to `generativelanguage.googleapis.com` fail after uploading large files (~46 MB). Exhaustively tested with 6+ workarounds — none succeeded. The Gemini File API upload path is permanently unusable for this workflow.
**Migration**: Long-video transcription now uses Deepgram Nova-2 via `deepgram.client.ts`. Short-video transcription continues to use Gemini `file_uri` (no upload involved).
