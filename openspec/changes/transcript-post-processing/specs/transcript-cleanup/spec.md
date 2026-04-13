## ADDED Requirements

### Requirement: Single-letter English token merge
The system SHALL detect sequences of 2 or more isolated uppercase English letters separated by spaces and merge them into a single token. This MUST run before dictionary replacement.

#### Scenario: Ticker symbol fragments
- **WHEN** transcript contains "T S M C"
- **THEN** output contains "TSMC"

#### Scenario: Index abbreviation fragments
- **WHEN** transcript contains "N V D A"
- **THEN** output contains "NVDA"

#### Scenario: Short sequences preserved
- **WHEN** transcript contains a single isolated letter like "I went to A store"
- **THEN** the single letter "A" is NOT merged with surrounding words

#### Scenario: Mixed case not merged
- **WHEN** transcript contains "T s m c" (lowercase letters in sequence)
- **THEN** the sequence is NOT merged (only uppercase sequences are merged)

### Requirement: Dictionary-based term replacement
The system SHALL load a terminology dictionary from a JSON file and replace all matched patterns in the transcript. The dictionary MUST support both exact string matches and regex patterns. Patterns MUST be pre-compiled at load time for performance.

#### Scenario: Exact match replacement
- **WHEN** dictionary contains `{ "pattern": "台 积 电", "replacement": "台積電" }`
- **AND** transcript contains "台 积 电"
- **THEN** output contains "台積電"

#### Scenario: Regex pattern replacement
- **WHEN** dictionary contains `{ "pattern": "T S M C?", "replacement": "TSMC", "regex": true }`
- **AND** transcript contains "T S M"
- **THEN** output contains "TSMC"

#### Scenario: Multiple replacements in one transcript
- **WHEN** transcript contains both "台 积 电" and "N or d VPN"
- **THEN** both are replaced in a single pass

#### Scenario: No match leaves text unchanged
- **WHEN** transcript contains no dictionary patterns
- **THEN** output is identical to input

### Requirement: Dictionary file structure
The dictionary MUST be a JSON file at `src/data/transcript-dictionary.json` with a versioned schema. Terms MUST be organised into named categories for maintainability. Each term MUST have `pattern` and `replacement` fields, with an optional `regex: true` flag.

#### Scenario: Valid dictionary loads successfully
- **WHEN** the dictionary file contains valid JSON with categories and terms
- **THEN** all terms are loaded and patterns are pre-compiled

#### Scenario: Dictionary is lazily loaded
- **WHEN** the cleanup function is called for the first time
- **THEN** the dictionary is loaded from disk and cached in memory

### Requirement: Simplified to Traditional Chinese conversion
The system SHALL convert Simplified Chinese characters to Traditional Chinese equivalents using OpenCC (opencc-js). This MUST run as the final pass after letter merge and dictionary replacement.

#### Scenario: Simplified characters converted
- **WHEN** transcript contains "信息" (Simplified)
- **THEN** output contains "資訊" (Traditional)

#### Scenario: Already-Traditional text unchanged
- **WHEN** transcript contains "台積電" (already Traditional)
- **THEN** output is unchanged

#### Scenario: English-only text unchanged
- **WHEN** transcript contains only English text
- **THEN** output is unchanged (no conversion applied)

### Requirement: Cleanup function is pure and idempotent
The cleanup function SHALL be a pure function: same input always produces same output, no side effects. Running it twice on the same text MUST produce identical output to running it once.

#### Scenario: Idempotent application
- **WHEN** cleanup("T S M 台 积 电") produces "TSM 台積電"
- **AND** cleanup is called again on "TSM 台積電"
- **THEN** output is still "TSM 台積電"
