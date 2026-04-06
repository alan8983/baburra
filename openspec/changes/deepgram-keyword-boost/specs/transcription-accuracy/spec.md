## ADDED Requirements

### Requirement: Transcription service composes a keyword list per request
The system SHALL provide a `composeKeywordList({ kolId? })` function that returns a merged list of keyword entries combining: (1) static zh-TW financial jargon loaded from `src/domain/services/keywords/zh-tw-financial.txt`, (2) active US/TW tickers from the `stocks` table, and (3) the display name plus aliases of the supplied KOL when `kolId` is provided. Default weight SHALL be 2.0 for jargon and KOL names, 3.0 for tickers, and no entry SHALL exceed weight 5.0 without an explicit override.

#### Scenario: Compose without a KOL
- **WHEN** `composeKeywordList({})` is called
- **THEN** the result SHALL contain jargon and ticker entries but no KOL-specific entries

#### Scenario: Compose with a KOL
- **WHEN** `composeKeywordList({ kolId: 'kol-123' })` is called and KOL 123's display name is "股癌"
- **THEN** the result SHALL include `{ term: '股癌', weight: 2.0 }` in addition to the static jargon and tickers

### Requirement: Deepgram client forwards keywords as query params
When `DEEPGRAM_KEYWORD_BOOST_ENABLED` is `true`, the Deepgram client wrapper SHALL serialize each keyword entry as `keyword:weight` and send them as repeated `keywords` query parameters on the `listen` request. When the flag is `false`, the wrapper SHALL NOT send any `keywords` parameter.

#### Scenario: Flag enabled, request includes keywords
- **WHEN** `transcribeAudio({ kolId: 'kol-123' })` is invoked with the flag enabled
- **THEN** the outbound Deepgram request URL SHALL contain at least one `keywords=` query parameter, each formatted as `term:weight`

#### Scenario: Flag disabled, request omits keywords
- **WHEN** the same call is made with the flag disabled
- **THEN** the outbound Deepgram request URL SHALL NOT contain any `keywords` parameter

### Requirement: Gemini failover ignores keywords
The Gemini-audio failover path SHALL NOT receive or use the keyword list. Keyword boosting is a Deepgram-only feature in this change.

#### Scenario: Failover path drops keywords
- **WHEN** Deepgram fails and the transcription service falls back to Gemini audio
- **THEN** the Gemini audio request payload SHALL NOT contain a keywords field
