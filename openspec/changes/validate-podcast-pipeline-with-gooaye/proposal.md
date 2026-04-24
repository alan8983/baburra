## Why

The RSS → Deepgram → Gemini podcast pipeline has never been end-to-end stress tested at production volume. Earlier attempts were blocked by a `scrape_jobs_job_type_check` constraint (issue #51); the migration that fixed it (`20260406000000_scrape_jobs_allow_validation_scrape.sql`) has not been revalidated against the podcast path. Past failures clustered on **429 rate-limits** and **timeouts** — concurrency and queueing are the suspected weak points — but we currently lack the observability to prove where time is spent or where failures land. Until we can quantify durability we cannot safely seed the production DB, and the landing page stays sparse on day one. Gooaye (股癌) is an ideal specimen: real SoundOn feed, ~45-min Traditional-Chinese episodes, and a KOL we want in the seed anyway — so the stress test *is* the seed work for that KOL.

## What Changes

- Add lightweight per-stage timing instrumentation to the import pipeline (`processUrl` and its downstream calls), emitting `{stage, ms, ok, retries}` to the existing JSONL error-log stream. No new DB table.
- Define a mechanical durability metric — `success_rate = passed / attempted * 100` — parseable by `jq`/`awk` from the JSONL log, to drive the autoresearch tuning loop.
- Use `/autoresearch:predict --adversarial` across the pipeline modules to surface concurrency/429/timeout hypotheses with code:line evidence before running any live batch.
- Use `/autoresearch:scenario --focus failures --domain software` to enumerate concrete failure cases (concurrent, scale, recovery, temporal dimensions).
- Verify that migration `20260406000000_scrape_jobs_allow_validation_scrape.sql` covers the RSS/podcast `profile-scrape` path end-to-end (previously only smoke-tested for YouTube).
- Execute a staged stress run against Gooaye (S1: 1 ep → S2: 3 eps → S3: 10 eps → S3-rerun for idempotency → S4: full EP501-600 ~100 eps) via the existing [scripts/scrape-guyi-podcast-ep501-600.ts](scripts/scrape-guyi-podcast-ep501-600.ts). Capture observations to a baseline report inside this change directory.
- Run `/autoresearch` loop with `Goal: success_rate` + `Guard: npm run type-check` to tune concurrency knobs (batch-size, retry backoff) over the 10-episode sample; apply winning settings before S4.
- Document the public-launch acceptance gate (success rate ≥95%, cost within ±20% of estimate, idempotent re-run with zero duplicates, per-episode failure isolation). If S4 meets it, the Gooaye seed is launch-ready.
- Archive the obsolete `scripts/seed-kol-config.json` (placeholder `feeds.example.com` URLs) and close or rescope the parallel `seed-scraping-pipeline` change so its tasks 4.1–4.3 do not duplicate this work.

## Capabilities

### New Capabilities
- `pipeline-observability`: Per-stage timing log schema, mechanical durability metric definition, baseline-report format, and the acceptance-gate thresholds used to certify the pipeline launch-ready.

### Modified Capabilities
- `ai-pipeline`: Document the tuned concurrency defaults (batch-size, retry-backoff) that the autoresearch loop converges on, and record the verified Gooaye RSS end-to-end path (including the `validation_scrape` job-type coverage).

## Impact

- **Modified code**:
  - `src/domain/services/import-pipeline.service.ts` — per-stage `performance.now()` wrapping around each stage call; appends timing record to existing JSONL log.
  - `src/domain/services/profile-scrape.service.ts` — per-URL wall-clock record and per-batch summary (batch fill ratio, queue depth).
  - `src/infrastructure/api/deepgram.client.ts` — record retry count + final latency.
  - `src/infrastructure/api/gemini.client.ts` — record key-pool index used, retry count, `finishReason`.
  - `scripts/scrape-guyi-podcast-ep501-600.ts` — write run summary JSON (counts, p50/p95 timings, cost estimate) alongside the existing error log. Expose tunable `--retry-backoff-ms` flag.
- **Observability**: New `scripts/logs/seed-run-<timestamp>.summary.json` — aggregate per-stage p50/p95 + success rate. JSONL error log gains `timing` field.
- **Docs (inside change)**: `openspec/changes/validate-podcast-pipeline-with-gooaye/baseline.md` — durability observations from S1–S4. `openspec/changes/validate-podcast-pipeline-with-gooaye/design.md` — autoresearch predict+scenario output distilled.
- **Spec updates (at archive time)**: `openspec/specs/pipeline-observability/spec.md` (new), `openspec/specs/ai-pipeline/spec.md` (delta for tuned defaults + RSS path).
- **Removed**: `scripts/seed-kol-config.json` (placeholder data, never used).
- **Not in scope**: adding non-Gooaye KOLs in this change, pipeline architecture refactors, new extractors, cron automation, frontend/UI changes, migrating the JSONL log to a metrics table.
- **Dependencies**: no new runtime deps. Requires `.env.local` with `DEEPGRAM_API_KEY`, `GEMINI_API_KEYS`, `TIINGO_API_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`. Requires the `autoresearch` user-scope skill (already installed).
- **Cost**: S4 (~100 Gooaye eps × ~45 min) estimated at Deepgram $0.0043/min × ~4500 min ≈ **$19 Deepgram** + Gemini Flash-Lite within multi-key quota. Re-validated against current lego-credit costs in Stage 6.
