## MODIFIED Requirements

### Requirement: Transcript text preparation before AI analysis
The import pipeline SHALL apply transcript post-processing cleanup to `contentForAnalysis` before calling `analyzeDraftContent()`. This applies to both freshly transcribed and cache-retrieved transcripts. The cleanup step MUST be inserted after transcript retrieval (step 3) and before AI analysis (step 4) in the import pipeline.

#### Scenario: Fresh transcript is cleaned before analysis
- **WHEN** a YouTube video is transcribed by Deepgram
- **AND** the transcript contains garbled fragments ("T S M", "台 积 电")
- **THEN** the cleaned text ("TSM", "台積電") is passed to `analyzeDraftContent()`

#### Scenario: Cached transcript is also cleaned
- **WHEN** a transcript is retrieved from the transcript cache
- **AND** the cached text contains garbled fragments
- **THEN** the cleaned text is passed to `analyzeDraftContent()`

#### Scenario: Non-YouTube content passes through unchanged
- **WHEN** content comes from a non-YouTube source (Twitter, RSS, etc.) with no transcription
- **THEN** the text passes through cleanup but is effectively unchanged (no matching patterns)
