## ADDED Requirements

### Requirement: Multi-key API pool
The Gemini client SHALL support a pool of API keys configured via `GEMINI_API_KEYS` environment variable (comma-separated). Keys SHALL be rotated in round-robin order per request. If `GEMINI_API_KEYS` is not set, the client SHALL fall back to the single `GEMINI_API_KEY` variable.

#### Scenario: Multiple keys configured
- **WHEN** `GEMINI_API_KEYS=key1,key2,key3` is set
- **THEN** the 1st request uses `key1`, the 2nd uses `key2`, the 3rd uses `key3`, the 4th uses `key1`, cycling indefinitely

#### Scenario: Only single key configured
- **WHEN** `GEMINI_API_KEYS` is not set and `GEMINI_API_KEY=singlekey` is set
- **THEN** all requests use `singlekey` (backwards-compatible behavior)

#### Scenario: No keys configured
- **WHEN** neither `GEMINI_API_KEYS` nor `GEMINI_API_KEY` is set
- **THEN** the client SHALL throw an error on the first API call

### Requirement: Exponential backoff on quota exhaustion
When all models in the fallback chain are quota-exhausted across all API keys, the client SHALL retry the entire model × key matrix with exponential backoff delays of 2s, 6s, and 18s (3 retry attempts). Non-quota errors (e.g. 401, 500) SHALL propagate immediately without backoff.

#### Scenario: Transient quota error clears on retry
- **WHEN** all 3 models × all keys return 429 on the first pass
- **AND** the quota clears within 2 seconds
- **THEN** the second pass (after 2s backoff) succeeds

#### Scenario: Persistent quota exhaustion
- **WHEN** all models × all keys return 429 across all 4 passes (initial + 3 retries)
- **THEN** the client throws the last quota error after ~26s total wait

#### Scenario: Non-quota error short-circuits
- **WHEN** a model returns a 500 error
- **THEN** the error propagates immediately without trying other keys or backing off
