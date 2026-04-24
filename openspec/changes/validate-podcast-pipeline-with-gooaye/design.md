## Context

The Baburra import pipeline (`src/domain/services/import-pipeline.service.ts` → `profile-scrape.service.ts` → extractors → Deepgram → Gemini → Tiingo → Supabase) has been incrementally built and patched but never characterized as a whole. Prior attempts against Gooaye were cut short:

- **Smoke-test blocker (2026-04-06)**: `POST /api/scrape/profile` returned 500 due to `scrape_jobs_job_type_check` — new-KOL scrapes tried to insert `'validation_scrape'` but the DB only allowed `'initial_scrape' | 'incremental_check'`. Tracked in [issue #51](https://github.com/alan8983/investment-idea-monitor/issues/51). Migration `supabase/migrations/20260406000000_scrape_jobs_allow_validation_scrape.sql` landed to widen the CHECK constraint — but no end-to-end re-test has been run against the RSS/podcast path since.
- **Gemini failure modes (documented 2026-04-xx)**: `retry-gooaye-failed-v2.ts` documents three failure classes seen on the YouTube path — MAX_TOKENS truncation without retry, JSON parse errors not retried, unhandled rejected promises. Root cause fixes live in `gemini-key-pool-backoff` change. Whether those fixes reach the podcast path is not explicitly documented.
- **Concurrency**: the existing `scrape-guyi-podcast-ep501-600.ts` has a `--batch-size N` flag (default 3) driving `Promise.all` parallelism. The safe ceiling under a Gemini multi-key pool and Deepgram's serial-safe but concurrent-untested client is unknown.

Stakeholders: **one developer** (the user) preparing for public launch. Risk tolerance: data in the seed DB is public-facing, so incorrect AI extractions are worse than missing ones.

## Goals / Non-Goals

**Goals:**
- Produce a baseline durability report for the podcast pipeline with per-stage latency (p50/p95) and failure-rate data from a real 100-episode Gooaye run.
- Discover and tune the concurrency knob (`--batch-size`) and retry-backoff so that the mechanical success_rate metric is maximized before the seed run.
- Verify the `validation_scrape` migration covers the RSS profile-scrape path end-to-end.
- Seed the production DB with Gooaye episodes that pass the quality gate, meeting a documented launch-ready threshold.
- Leave behind a reusable observability pattern (per-stage timings in JSONL) that future KOL onboarding uses.

**Non-Goals:**
- Adding any non-Gooaye KOL in this change. Seed expansion is a separate follow-up.
- Refactoring the import pipeline into a queue/worker architecture. Investigate only.
- Migrating the JSONL log format to a dedicated `import_pipeline_metrics` table.
- New extractors or profile resolvers.
- Cron automation.
- Frontend/UI changes.
- Re-running the YouTube Gooaye scrape.

## Decisions

### D1. Observability goes into JSONL, not a metrics table
**Decision:** Instrument per-stage timings as an extra `timing: { stage, ms, ok, retries }[]` field appended to the existing JSONL error-log entry per URL. Aggregated p50/p95 computed offline in a Node script producing `scripts/logs/seed-run-<ts>.summary.json`.
**Alternative considered:** `import_pipeline_metrics` Supabase table with per-stage rows.
**Rationale:** We don't yet know which dimensions matter (stage? retry cause? key index?). A schema locks us in; JSONL lets us aggregate on whatever we find most useful after S4. Migration to a table becomes trivial once we know the shape — defer until empirical need justifies it.

### D2. Mechanical metric = `success_rate`
**Decision:** Define `success_rate = passed / attempted * 100` where `passed` = status `'success'` in `processUrl` result AND post row written, `attempted` = total URLs fed into `processJobBatch`. Metric emitted by a one-liner on `seed-run-*.summary.json` for easy `grep`/`jq` parsing.
**Alternative considered:** Composite score (e.g., success% − cost% − latency normalized).
**Rationale:** Autoresearch requires a single number to keep/revert. Composites blur causality — if the score moves, we don't know whether it was latency, cost, or success that changed. Track latency and cost in the log for visibility, but the one metric that drives keep/revert is the success rate. Cost becomes a **Guard** (`Guard-Threshold: 20%` regression).

### D3. Autoresearch sequence: predict → scenario → loop
**Decision:** Before any live scrape, run `/autoresearch:predict --adversarial --depth deep` scoped to the 5 pipeline files, with Goal="find concurrency, 429, timeout failure modes". Then `/autoresearch:scenario --focus failures --domain software --depth standard` seeded with "100 Gooaye episodes via RSS → Deepgram → Gemini, batch-size 3, Gemini key pool of N keys". Capture their handoff JSONs under `openspec/changes/validate-podcast-pipeline-with-gooaye/predict/` and `scenario/`. After S3 (10 eps), feed the empirical log into `/autoresearch` with the success_rate metric to tune.
**Alternative considered:** Jump straight to stress run, let empirical failures lead.
**Rationale:** Autoresearch predict is *free* (cost = context tokens, not infra) and reliably surfaces failure modes that would otherwise need a 100-ep run to expose. Scenarios give us explicit test cases we can inject (e.g., "Deepgram times out mid-episode") rather than waiting for nature to produce them.

### D4. Stage ladder is 1 → 3 → 10 → 10-rerun → 100
**Decision:**
| Stage | Episodes | Flags | Purpose | Hard stop if |
|-------|----------|-------|---------|-------------|
| S1-dry | 1 | `--dry-run --limit 1` | Feed parse, URL build, no DB | dry-run errors |
| S1 | 1 | `--limit 1` | End-to-end green, `validation_scrape` path works | any unhandled exception |
| S2 | 3 | `--limit 3` | AI quality on Taiwanese register | >1 episode hits MAX_TOKENS |
| S3 | 10 | `--limit 10 --batch-size 3` | Concurrency, key pool under load | 429s not auto-retried |
| S3' | 10 | re-run same command | Idempotency proof | any duplicate posts |
| Tune | — | `/autoresearch` loop on S3 sample | Optimize success_rate | — |
| S4 | 100 | `--limit 100` at tuned config | Launch-readiness | pass rate <40% or cost >2× est |
**Alternative considered:** Single "run 100 and see what happens."
**Rationale:** Bottlenecks are easier to isolate incrementally; cost-per-episode from S3 predicts S4's bill before committing. S3' (idempotency rerun) is the cheapest way to prove re-run safety before we own 100 eps of state.

### D5. seed-scraping-pipeline change: close, don't absorb
**Decision:** Mark `seed-scraping-pipeline` as superseded in its own proposal.md and archive it without running its tasks 4.1-4.3. This change (`validate-podcast-pipeline-with-gooaye`) is the successor with a narrower scope.
**Alternative considered:** Absorb tasks 4.1-4.3 into this change.
**Rationale:** The parent change targeted 19 KOLs with a placeholder config. User explicitly rescoped to "Gooaye + a few YouTube channels". Absorbing creates a scope mismatch; cleaner to retire and reference.

### D6. scripts/seed-kol-config.json: delete, not archive
**Decision:** `git rm scripts/seed-kol-config.json`. Remove references in `scripts/seed-scrape.ts` or mark that script as orphaned with a header comment pointing to `scrape-guyi-podcast-ep501-600.ts` as the current canonical seeder.
**Alternative considered:** Move to `scripts/archive/seed-kol-config.json`.
**Rationale:** It has `feeds.example.com` placeholders — zero real content. Keeping an example that never worked invites confusion. If we later want a multi-KOL config, we'll generate a fresh one from real data.

### D7. Public-launch gate thresholds
**Decision:** Gooaye seed is launch-ready when all of:
- success_rate ≥ **95%** on S4 (≥95 of 100 episodes produce a post row)
- quality-gate pass rate ≥ **55%** (aligns with prior `seed-scraping-pipeline` target)
- S3' produces **zero duplicate** post rows vs S3 (idempotency proof)
- cost(S4) within **±20%** of the S3-extrapolated estimate
- no unhandled exception propagates past `processJobBatch` during S4
- every failed URL has a logged reason (no silent drops)
**Alternative considered:** Looser (90% success, ±40% cost).
**Rationale:** Data is public-facing. 95% success + bounded cost is a reasonable bar for v1 without being aspirational.

## Risks / Trade-offs

- **[Instrumentation overhead changes behavior]** → Mitigation: `performance.now()` is ~µs; only append to JSONL on completion of each URL (not per stage mid-flight), so I/O overhead is per-URL not per-stage.
- **[Gemini key pool exhaustion mid-S4]** → Mitigation: pre-S4, confirm `GEMINI_API_KEYS` env var has ≥N keys (to be measured during S3) and Flash-Lite fallback is wired. Add to the `/autoresearch:predict` scope explicitly.
- **[Deepgram silent hallucination on low-audio-quality episodes]** → Mitigation: transcript post-processing cleanup (commit `372b9a6`) is already in place; S2 review explicitly spot-checks 3 transcripts against audio for quality.
- **[S4 costs spike beyond estimate]** → Mitigation: Cost Guard in autoresearch loop (`Guard-Threshold: 20%`). Manually check cost running total after every 25 episodes in S4.
- **[Idempotency check misses duplicates created via race]** → Mitigation: S3' runs *serially* first (batch-size 1), then one re-run with original batch-size, to isolate race-created duplicates from pure idempotency bugs.
- **[Autoresearch loop overfits to S3's 10-ep sample]** → Mitigation: S4 is a validation run, not a tuning run — settings chosen by autoresearch are fixed before S4. Any S4 regression gets logged but does not re-trigger tuning in this change.
- **[Migration `20260406000000` doesn't cover RSS]** → Mitigation: Stage 3 explicitly reads the migration, greps call sites in `profile-scrape.service.ts` for `job_type` values, and S1-dry is the proof. If it fails, write a new migration in a scoped follow-up (out-of-scope to complete here, but blocker must be filed).

## Migration Plan

- **Forward**: instrumentation is additive (new JSONL fields, new summary file). No schema changes. `scripts/seed-kol-config.json` deletion is a no-op (script that read it will be marked orphaned with a comment, not removed — keeps history intact).
- **Rollback of seed data**: `scripts/seed-rollback.sql` already exists from `seed-scraping-pipeline` (tasks 4.4). Verified to scope `WHERE source='seed'` across `kol_sources`, `posts`, `post_arguments`, `post_stocks`, `scrape_jobs`, and orphan cleanup for `kols`. Run if S4 fails the launch gate.
- **Rollback of instrumentation**: `git revert` on the instrumentation commit. JSONL extra field is ignored by existing readers; removing it has no runtime impact.

## Open Questions

- **Q1**: Does the `validation_scrape` migration cover the RSS path? → Resolved by Stage 3 in tasks.md.
- **Q2**: How many Gemini API keys are currently pooled in `.env.local`? → To be captured at start of Stage 0 in tasks.md; informs whether key pool is a bottleneck or red herring.
- **Q3**: What is the true episode-length distribution of Gooaye EP501-600? → Autoresearch scenario step feeds this into the hypothesis queue; measured concretely during S1-dry (parse all 100 titles/durations without running).
- **Q4**: Do we want `--batch-size` to be adaptive (back off on 429s) or static (find the right fixed value)? → Defer to Stage 5; autoresearch loop result will tell us whether a static value plateaus or whether adaptive backoff wins consistently.
- **Q5**: Should the baseline report be promoted to a long-lived `docs/pipeline-baseline.md` for future regressions? → Out of scope for this change; revisit at archive time.
