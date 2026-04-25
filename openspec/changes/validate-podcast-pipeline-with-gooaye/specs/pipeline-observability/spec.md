## ADDED Requirements

### Requirement: Per-stage timing logs on every import attempt

The import pipeline SHALL record per-stage wall-clock timing and retry counts for every URL it processes. The record MUST be written to the same JSONL stream as existing error logs (no new file per URL; one line per URL completion) and MUST include at minimum: `stage` (string, enum), `ms` (number, wall-clock duration), `ok` (boolean, whether the stage succeeded), `retries` (integer, times the stage retried internally). Recognized stage values MUST include: `rss_lookup`, `audio_download`, `deepgram`, `gemini_args`, `gemini_sentiment`, `tiingo`, `supabase_write`. A stage MUST NOT block pipeline execution to compute its timing — `performance.now()` deltas are recorded and emitted after the URL completes.

#### Scenario: Successful import emits one timing entry per executed stage
- **WHEN** a URL completes successfully through all pipeline stages
- **THEN** the JSONL log line for that URL contains a `timing` array with one entry per stage actually executed, each with `ok: true` and a numeric `ms` value greater than 0

#### Scenario: Failed stage still emits its timing
- **WHEN** a stage fails (e.g., Deepgram returns 429 after all retries) and the URL is marked failed
- **THEN** the JSONL log line contains a `timing` entry for the failed stage with `ok: false` and `retries` reflecting retries attempted, and no timing entries for stages that did not run

#### Scenario: Instrumentation overhead is negligible
- **WHEN** the same URL is imported with and without the timing instrumentation enabled
- **THEN** the wall-clock difference between the two runs is under 50ms for a 45-minute podcast episode

### Requirement: Mechanical success-rate metric output

A run-summary file SHALL be written at the end of every seed-script invocation to `scripts/logs/seed-run-<timestamp>.summary.json`. The file MUST contain at minimum: `attempted` (integer), `passed` (integer), `failed` (integer), `success_rate` (number, `passed / attempted * 100`, rounded to 1 decimal), plus aggregated per-stage p50 and p95 latencies. The `success_rate` field MUST be extractable by a single-line `jq` expression. The summary generation MUST NOT block the script from exiting if the underlying JSONL log is malformed — it SHALL emit a best-effort summary with a warning field.

#### Scenario: Autoresearch can parse the metric
- **WHEN** `jq -r '.success_rate' scripts/logs/seed-run-*.summary.json | tail -1` is executed after a run
- **THEN** the command emits a single numeric value between 0 and 100

#### Scenario: Partial failure still produces a summary
- **WHEN** the script crashes mid-run (e.g., process killed after 50 of 100 episodes)
- **THEN** a summary file is still written reflecting the 50 attempted episodes, with a `partial: true` flag

### Requirement: Baseline report format

The baseline report for any stress-test invocation SHALL live in the change directory at `baseline.md` and MUST contain the following sections in order: `Run metadata` (date, git SHA, env vars non-secret), `Per-stage latency` (table of stage → p50/p95/count), `Failure taxonomy` (grouped failure reasons with counts), `Cost actuals` (Deepgram minutes + Gemini token counts + derived USD), `Observations` (free-form notes keyed to stage IDs S1–S4). The report MUST be human-readable and the failure-taxonomy section MUST be machine-generable from the JSONL log by a checked-in script.

#### Scenario: Baseline is reproducible
- **WHEN** two maintainers run the same stress stage at the same git SHA on the same dataset
- **THEN** both produce baseline reports with matching per-stage latency rows (within ±10% on p50) and identical failure-taxonomy grouping

### Requirement: Public-launch readiness gate

The seed data SHALL be considered launch-ready only when all of the following hold on the S4 run (full Gooaye EP501-600 at tuned concurrency): `success_rate ≥ 95`, `quality_gate_pass_rate ≥ 55`, zero duplicate post rows on idempotency rerun, cost within ±20% of the S3-extrapolated estimate, no unhandled exception propagated past `processJobBatch`, and every failed URL has a logged reason string. Each gate MUST be mechanically verifiable from the summary file and/or the DB; subjective sign-off is NOT a substitute.

#### Scenario: Gate passes and seed is promoted
- **WHEN** an S4 run produces a summary with all six gate criteria met
- **THEN** the change's tasks.md S4 task may be checked off and the launch-readiness declaration in `baseline.md` records the summary path

#### Scenario: Gate fails and rollback is required
- **WHEN** an S4 run produces a summary with any gate criterion not met
- **THEN** the change's tasks.md S4 task remains unchecked, `baseline.md` records the failing criterion and the remediation plan, and if the failure class is AI quality (not infra), `scripts/seed-rollback.sql` is run before any re-attempt
