## ADDED Requirements

### Requirement: Estimate processing time per URL
The system SHALL estimate processing time for each URL based on platform, caption availability, and video duration before the user confirms import.

#### Scenario: YouTube video without captions (known duration)
- **WHEN** a YouTube URL with no captions and `durationSeconds = 3600` (60 min) is queued
- **THEN** estimated time SHALL be `12 + (60 × 1) + 15 = 87 seconds`

#### Scenario: YouTube video without captions (unknown duration)
- **WHEN** a YouTube URL with no captions and `durationSeconds = null` is queued
- **THEN** estimated time SHALL default to 10 minutes assumed duration: `12 + (10 × 1) + 15 = 37 seconds`

#### Scenario: YouTube video with captions
- **WHEN** a YouTube URL with available captions is queued
- **THEN** estimated time SHALL be 8 seconds

#### Scenario: Non-YouTube URL (text content)
- **WHEN** a Twitter/X or other text URL is queued
- **THEN** estimated time SHALL be 5 seconds

### Requirement: Display time estimate alongside credit cost
The system SHALL show the time estimate next to the credit cost in the import confirmation UI.

#### Scenario: Single URL display
- **WHEN** user has entered 1 YouTube URL (60 min, no captions)
- **THEN** the UI SHALL display "600 credits · ~1.5 min"

#### Scenario: Batch URL display
- **WHEN** user has entered 3 URLs (1 long video + 2 articles) processed in parallel
- **THEN** the batch time estimate SHALL be the maximum of individual estimates (not the sum)

### Requirement: Batch time estimation uses parallel processing model
The system SHALL calculate batch time as the maximum of individual URL estimates, since URLs are processed via `Promise.allSettled()`.

#### Scenario: Mixed batch
- **WHEN** batch contains URLs estimated at [87s, 5s, 5s]
- **THEN** batch estimate SHALL be 87 seconds (max), not 97 seconds (sum)
