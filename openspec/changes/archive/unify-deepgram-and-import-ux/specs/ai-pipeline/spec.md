## MODIFIED Requirements

### Requirement: Video transcription routing
The system SHALL transcribe ALL captionless YouTube videos using Deepgram Nova-3 via audio download, regardless of video duration. The Gemini `file_uri` transcription path SHALL be removed.

#### Scenario: Short video without captions (≤30 min)
- **WHEN** a YouTube video of 15 minutes with no captions is imported
- **THEN** the system SHALL download audio via yt-dlp and transcribe via Deepgram Nova-3

#### Scenario: Long video without captions (>30 min)
- **WHEN** a YouTube video of 90 minutes with no captions is imported
- **THEN** the system SHALL download audio via yt-dlp and transcribe via Deepgram Nova-3

#### Scenario: Video with null duration
- **WHEN** a YouTube video with `durationSeconds = null` and no captions is imported
- **THEN** the system SHALL proceed with Deepgram transcription (no routing decision needed)

#### Scenario: Video with captions
- **WHEN** a YouTube video with available captions is imported
- **THEN** the system SHALL use the caption text directly (no transcription API call)

#### Scenario: Video exceeding max duration
- **WHEN** a YouTube video exceeding 120 minutes is imported
- **THEN** the system SHALL reject it with an error before downloading audio

## ADDED Requirements

### Requirement: Deepgram retry with exponential backoff
The Deepgram client SHALL retry transient failures up to 2 times with exponential backoff (5s, 15s).

#### Scenario: Transient 503 on first attempt
- **WHEN** Deepgram returns HTTP 503 on the first attempt
- **THEN** the client SHALL wait 5 seconds and retry

#### Scenario: Transient 503 on second attempt
- **WHEN** Deepgram returns HTTP 503 on the second attempt (first retry)
- **THEN** the client SHALL wait 15 seconds and retry a final time

#### Scenario: Non-retryable 400 error
- **WHEN** Deepgram returns HTTP 400 (bad request)
- **THEN** the client SHALL throw immediately without retrying

#### Scenario: Non-retryable 401/403 error
- **WHEN** Deepgram returns HTTP 401 or 403
- **THEN** the client SHALL throw immediately without retrying

#### Scenario: Timeout on attempt
- **WHEN** a Deepgram request times out (180s)
- **THEN** the client SHALL treat it as a retryable error

#### Scenario: All retries exhausted
- **WHEN** all 3 attempts (1 original + 2 retries) fail
- **THEN** the client SHALL throw the last error

### Requirement: Post-transcription credit reconciliation
The system SHALL reconcile credit charges against actual transcription duration after Deepgram returns results.

#### Scenario: Actual duration shorter than estimate (>20% difference)
- **WHEN** estimated duration was 60 minutes but Deepgram's last utterance ends at 42 minutes (30% shorter)
- **THEN** the system SHALL refund `(Math.ceil(60) - Math.ceil(42)) × 5 = 90` credits

#### Scenario: Actual duration longer than estimate (>20% difference)
- **WHEN** estimated duration was 10 minutes (null duration default) but actual is 45 minutes
- **THEN** the system SHALL attempt to consume `(Math.ceil(45) - Math.ceil(10)) × 5 = 175` additional credits

#### Scenario: Difference within 20% threshold
- **WHEN** estimated duration was 60 minutes and actual is 55 minutes (8% difference)
- **THEN** the system SHALL NOT reconcile (skip adjustment)

#### Scenario: Reconciliation failure
- **WHEN** additional credit consumption fails (e.g., insufficient balance)
- **THEN** the system SHALL log the discrepancy and continue with post creation (do NOT block the pipeline)

### Requirement: Fix Nova-2 comment references
All code comments referencing "Nova-2" SHALL be updated to "Nova-3" to match the actual model in use.

#### Scenario: Comment accuracy
- **WHEN** reviewing `deepgram.client.ts` line 2, line 68, and `import-pipeline.service.ts` line 232
- **THEN** all references SHALL say "Nova-3" instead of "Nova-2"

## REMOVED Requirements

### Requirement: Gemini video transcription function
**Reason**: Replaced by unified Deepgram Nova-3 transcription for all captionless videos. Gemini `file_uri` path had known socket bug for long uploads and is 2-7× more expensive.
**Migration**: All video transcription calls route through `deepgramTranscribe()`. Remove `geminiTranscribeVideo()` from `gemini.client.ts` and all related helper functions (`getMaxOutputTokens`, dynamic timeout logic).

### Requirement: Duration-based transcription routing
**Reason**: With unified Deepgram path, the 30-minute threshold router (`isLongVideo` check) is no longer needed.
**Migration**: Remove `LONG_VIDEO_THRESHOLD_SECONDS` constant and the `if (isLongVideo)` branching in `import-pipeline.service.ts`.
