## MODIFIED Requirements

### Requirement: Credit cost constants
The `CREDIT_COSTS` object SHALL define the following per-operation credit costs:

| Operation | Credits | Notes |
|---|---|---|
| `text_analysis` | 1 | Unchanged |
| `youtube_caption_analysis` | 2 | Unchanged |
| `video_transcription_per_min` | **5** | Changed from 7 — reflects lower Deepgram cost |
| `reroll_analysis` | 3 | Unchanged |

#### Scenario: Video transcription credit calculation
- **WHEN** a 60-minute captionless video is imported
- **THEN** the system SHALL charge `Math.ceil(60) × 5 = 300` credits for transcription

#### Scenario: Unknown duration default
- **WHEN** a video with `durationSeconds = null` is imported
- **THEN** the system SHALL estimate 1 minute (`Math.ceil(60 / 60) × 5 = 5` credits) as initial charge, subject to post-transcription reconciliation

### Requirement: Free tier weekly credit limit
The `CREDIT_LIMITS.free` value SHALL be **700** credits per week (changed from 850).

#### Scenario: Free user weekly allowance
- **WHEN** a free-tier user's credits reset at the weekly boundary
- **THEN** their `credit_balance` SHALL be set to 700

#### Scenario: Free user capacity for target use case
- **WHEN** a free user imports 2 × 60-min captionless videos + 5 text articles + 3 captioned YouTube videos
- **THEN** total credits consumed SHALL be `(120 × 5) + (5 × 1) + (3 × 2) = 611` credits, within the 700 limit

### Requirement: Database migration for new free tier default
A migration SHALL update the default `credit_balance` for the free tier and the `consume_credits` / weekly-reset functions to use 700 as the free tier cap.

#### Scenario: New user registration
- **WHEN** a new user registers with the free tier
- **THEN** their `credit_balance` SHALL be initialized to 700

#### Scenario: Existing user weekly reset
- **WHEN** an existing free-tier user's `credit_reset_at` timestamp passes
- **THEN** their `credit_balance` SHALL be reset to 700 (not 850)
