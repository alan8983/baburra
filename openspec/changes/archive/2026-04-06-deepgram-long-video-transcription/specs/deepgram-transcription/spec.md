## ADDED Requirements

### Requirement: Deepgram transcription client

The system SHALL provide a `deepgramTranscribe()` function in `src/infrastructure/api/deepgram.client.ts` that sends audio data to the Deepgram Nova-2 REST API (`POST https://api.deepgram.com/v1/listen`) and returns the transcript as formatted text.

The function SHALL accept a `Buffer` of audio data and a MIME type, and return a string containing the transcript with speaker labels and timestamps.

#### Scenario: Successful transcription of Chinese Mandarin audio
- **WHEN** `deepgramTranscribe(buffer, 'audio/webm')` is called with valid Opus/WebM audio containing Chinese Mandarin speech
- **THEN** the function returns a non-empty string containing the transcribed text with `[Speaker N, HH:MM:SS]` prefixes per paragraph

#### Scenario: Successful transcription of English audio
- **WHEN** `deepgramTranscribe(buffer, 'audio/mp4')` is called with valid m4a audio containing English speech
- **THEN** the function returns a non-empty string with speaker-labeled paragraphs

#### Scenario: Missing API key
- **WHEN** `DEEPGRAM_API_KEY` is not set in environment
- **THEN** the function throws an error with message indicating the missing key

#### Scenario: Deepgram API error (4xx/5xx)
- **WHEN** Deepgram returns an error response
- **THEN** the function throws an error with the HTTP status and error message from the response body

### Requirement: Deepgram API parameters

The Deepgram request SHALL use the following query parameters:
- `model=nova-2` — model selection
- `detect_language=true` — automatic language detection (Chinese Mandarin, English, etc.)
- `smart_format=true` — punctuation and formatting
- `paragraphs=true` — paragraph-level grouping
- `diarize=true` — speaker identification
- `utterances=true` — utterance-level results with speaker and timing

#### Scenario: Multi-speaker audio
- **WHEN** audio contains multiple speakers (e.g., podcast interview)
- **THEN** the transcript labels different speakers as `[Speaker 0, ...]`, `[Speaker 1, ...]`, etc.

#### Scenario: Single-speaker audio
- **WHEN** audio contains a single speaker (e.g., KOL monologue)
- **THEN** the transcript labels all paragraphs as `[Speaker 0, ...]`

### Requirement: Transcript formatting

The function SHALL format the Deepgram response into structured text where each utterance is on its own line, prefixed with `[Speaker N, HH:MM:SS]`.

#### Scenario: Formatted output structure
- **WHEN** Deepgram returns utterances with speaker IDs and start times
- **THEN** the output is formatted as:
  ```
  [Speaker 0, 00:01:23] First utterance text here...
  [Speaker 0, 00:02:45] Second utterance text here...
  [Speaker 1, 00:03:30] Third utterance from different speaker...
  ```

### Requirement: Request timeout

The function SHALL enforce a timeout of 180 seconds for the Deepgram API request via `AbortController`.

#### Scenario: Deepgram takes too long
- **WHEN** the Deepgram API does not respond within 180 seconds
- **THEN** the request is aborted and an error is thrown

### Requirement: Environment variable

The system SHALL require `DEEPGRAM_API_KEY` in the environment. This key SHALL be documented in `.env.example`.

#### Scenario: Key present in environment
- **WHEN** `DEEPGRAM_API_KEY` is set
- **THEN** it is used as `Authorization: Token <key>` header in Deepgram requests
