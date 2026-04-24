## 0. Preconditions & Cleanup

- [ ] 0.1 Copy `.env.local` into this worktree root (per CLAUDE.md worktree setup) and confirm it contains `DEEPGRAM_API_KEY`, at least 3 comma-separated `GEMINI_API_KEYS`, `TIINGO_API_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`
- [ ] 0.2 Run `npm install` in the worktree (node_modules are not shared across worktrees)
- [ ] 0.3 Record the current key-pool size (count of keys in `GEMINI_API_KEYS`) and Deepgram rate-limit tier into `openspec/changes/validate-podcast-pipeline-with-gooaye/baseline.md` under a `Run metadata` section (Design Q2)
- [x] 0.4 Mark `openspec/changes/seed-scraping-pipeline/proposal.md` as superseded by appending a `## Superseded` section linking to this change (per Design D5). Do not delete; archive separately if desired.
- [x] 0.5 `git rm scripts/seed-kol-config.json` and add a header comment to `scripts/seed-scrape.ts` marking it orphaned with a pointer to `scripts/scrape-guyi-podcast-ep501-600.ts` (per Design D6)
- [ ] 0.6 Commit 0.1–0.5 as `chore(seed): supersede placeholder 19-KOL seed pipeline`

## 1. Observability Instrumentation (Stage 0)

- [x] 1.1 Define a `StageTiming` type (`{ stage: 'rss_lookup' | 'audio_download' | 'deepgram' | 'gemini_args' | 'gemini_sentiment' | 'tiingo' | 'supabase_write'; ms: number; ok: boolean; retries: number }`) in `src/domain/models/pipeline-timing.ts` (new file)
- [x] 1.2 Wrap each stage call in `src/domain/services/import-pipeline.service.ts`'s `processUrl()` with `performance.now()` deltas; accumulate into a `timings: StageTiming[]` array local to the URL execution. *(Reused existing `PipelineTimings` struct; added `buildStageTimings()` to convert at return time. Tiingo stage not yet wired — price hydration sits outside processUrl; documented as a gap.)*
- [x] 1.3 Thread the `timings` array into the existing JSONL log line written per-URL (append a `timing` field; do not change the shape of pre-existing fields). *(Extended `ImportUrlResult.timings`; added `UrlCompletionHook` to `processJobBatch` so seed scripts can subscribe without querying the DB.)*
- [x] 1.4 In `src/infrastructure/api/deepgram.client.ts`, record its own retry count into a returned metadata object (`{ ms, retries }`) that `processUrl()` reads to populate the `deepgram` timing entry. *(Out-param pattern — optional `meta?: DeepgramCallMeta`.)*
- [x] 1.5 In `src/infrastructure/api/gemini.client.ts`, record `retries`, `keyIndex`, and `finalModel` per call; return via a metadata shape consumed by `processUrl()` for `gemini_args` and `gemini_sentiment` entries. *(Threaded through `generateContent`/`generateJson`/`generateStructuredJson` → `ai.service.ts` → `processUrl`.)*
- [x] 1.6 Create `scripts/lib/summarize-run.ts` that reads one JSONL error/timing log + DB post counts and writes `scripts/logs/seed-run-<ts>.summary.json` with `attempted`, `passed`, `failed`, `success_rate`, and per-stage `{p50, p95, count}`
- [x] 1.7 Modify `scripts/scrape-guyi-podcast-ep501-600.ts` to invoke `summarize-run.ts` at exit (success, error, or SIGINT) so partial runs still produce a summary with `partial: true`
- [x] 1.8 Add a Vitest unit test for `summarize-run.ts` covering: well-formed log → correct metric; malformed log line → warning field in output; zero-attempt input → `success_rate: 0, partial: true` *(9 tests across parseJsonl + aggregateSummary. Required widening `vitest.config.mts` include to cover `scripts/**/*.test.ts`.)*
- [x] 1.9 Run `npm run type-check` and `npx vitest run` — type-check clean; 58 test files / 943 tests pass (1 pre-existing test updated to match new `extractArguments` signature).
- [ ] 1.10 Commit 1.1–1.9 as `feat(pipeline): per-stage timing instrumentation + run summary`

## 2. Migration Verification (Stage 3, done early)

- [ ] 2.1 Read `supabase/migrations/20260406000000_scrape_jobs_allow_validation_scrape.sql` end-to-end; confirm it widens the `scrape_jobs_job_type_check` CHECK constraint to include `'validation_scrape'`
- [ ] 2.2 Grep `profile-scrape.service.ts` for every `job_type` value used when `platform === 'podcast'` — enumerate them in `baseline.md` under `Stage 3 — migration verification`
- [ ] 2.3 Run `supabase migration list -p "$SUPABASE_DB_PASSWORD"` in the worktree; confirm `20260406000000` is present on remote (no `local only`)
- [ ] 2.4 Execute `npx tsx scripts/scrape-guyi-podcast-ep501-600.ts --dry-run --limit 1` — confirm no DB writes attempted; capture parsed episode title/duration into baseline.md
- [ ] 2.5 Mark Open Question Q1 in design.md as `Resolved: <yes|no>` with the evidence from 2.4 (or file a follow-up OpenSpec change if a new migration is needed — out of scope here)

## 3. Autoresearch Predict (Stage 1)

- [ ] 3.1 Invoke `/autoresearch:predict --adversarial --depth deep --scope src/domain/services/import-pipeline.service.ts,src/domain/services/profile-scrape.service.ts,src/infrastructure/extractors/podcast.extractor.ts,src/infrastructure/api/gemini.client.ts,src/infrastructure/api/deepgram.client.ts,scripts/scrape-guyi-podcast-ep501-600.ts` with `Goal: Find concurrency, 429, and timeout failure modes in the RSS → Deepgram → Gemini path under Gooaye-scale batch import (100 episodes, batch-size 3-10)`, `Iterations: 1`, `--budget 20`
- [ ] 3.2 Copy the resulting `predict/<ts>-<slug>/` directory into `openspec/changes/validate-podcast-pipeline-with-gooaye/predict/`
- [ ] 3.3 Read `predict/handoff.json` and `predict/findings.md`; transcribe the top 5 highest-confidence findings into `baseline.md` under `Stage 1 — predict findings`
- [ ] 3.4 For each finding classified `critical` or `high`, open a checkbox under §5 (tuning candidates) naming the hypothesis

## 4. Autoresearch Scenario (Stage 2)

- [ ] 4.1 Invoke `/autoresearch:scenario --focus failures --domain software --depth standard` with seed scenario `Seed: 100 Gooaye episodes (avg ~45 min) scraped via RSS → Deepgram → Gemini, batch-size 3, Gemini key pool of <N from 0.3> keys`, `Iterations: 25`
- [ ] 4.2 Copy the resulting `scenario/<ts>-<slug>/` directory into `openspec/changes/validate-podcast-pipeline-with-gooaye/scenario/`
- [ ] 4.3 Filter the generated `scenarios.md` for the dimensions `concurrent`, `scale`, `recovery`, `temporal` — list the top 10 as deliberate-probe candidates in `baseline.md` under `Stage 2 — failure scenarios`
- [ ] 4.4 From that list, pick 2 scenarios that CAN be injected without real-money cost (e.g., mock Deepgram 429 mid-episode, doctored RSS with duplicate GUID) and add checkboxes under §6

## 5. Staged Stress Runs (Stage 4 — Ladder)

- [ ] 5.1 **S1-dry**: `npx tsx scripts/scrape-guyi-podcast-ep501-600.ts --dry-run --limit 1` — record parsed episode + no DB writes to baseline.md `S1-dry`
- [ ] 5.2 **S1**: `npx tsx scripts/scrape-guyi-podcast-ep501-600.ts --limit 1` — verify one `posts` row created for platform user, one `scrape_jobs` row with status `completed`, timing log contains all 7 stages; paste summary.json path into `baseline.md` `S1`
- [ ] 5.3 **S2**: `npx tsx scripts/scrape-guyi-podcast-ep501-600.ts --limit 3` — manually spot-check the 3 resulting posts' arguments against the transcript for factual accuracy; record any MAX_TOKENS or JSON-parse warnings
- [ ] 5.4 **S3**: `npx tsx scripts/scrape-guyi-podcast-ep501-600.ts --limit 10 --batch-size 3` — target ≥90% success on the 10-ep sample; if 429s observed, capture `retries`/`keyIndex` distribution into baseline.md `S3`
- [ ] 5.5 **S3-serial-rerun**: re-run the same command with `--batch-size 1` — must insert 0 new posts (idempotency proof); query `SELECT COUNT(*) FROM posts WHERE source='seed' AND kol_id IN (SELECT id FROM kols WHERE display_name LIKE '%股癌%')` before/after to verify
- [ ] 5.6 **S3-parallel-rerun**: re-run with the original `--batch-size 3` — must also insert 0 new posts; if duplicates appear, file the exact SQL + bug to §7.1 and STOP before S4
- [ ] 5.7 If S3-rerun passes with 0 duplicates, proceed to §6 tuning. If not, diagnose + patch + rerun S3/S3-rerun before continuing.

## 6. Autoresearch Tuning Loop (Stage 5)

- [ ] 6.1 Run `/autoresearch:plan` with `Goal: Maximize success_rate on the 10-episode Gooaye S3 sample by tuning concurrency and retry settings`; confirm the wizard emits a Verify command like `npx tsx scripts/scrape-guyi-podcast-ep501-600.ts --limit 10 --batch-size $BATCH_SIZE --retry-backoff-ms $BACKOFF && jq -r '.success_rate' scripts/logs/seed-run-*.summary.json | tail -1`
- [ ] 6.2 Add `--retry-backoff-ms N` flag to `scripts/scrape-guyi-podcast-ep501-600.ts` (threads through to Deepgram + Gemini retry base delay)
- [ ] 6.3 Invoke `/autoresearch` with `Goal: <from 6.1>`, `Scope: scripts/scrape-guyi-podcast-ep501-600.ts, src/infrastructure/api/deepgram.client.ts, src/infrastructure/api/gemini.client.ts`, `Metric: jq -r '.success_rate' ... | tail -1`, `Direction: higher is better`, `Verify: <from 6.1>`, `Guard: npm run type-check`, `Iterations: 15`, `Plateau-Patience: 5`
- [ ] 6.4 Each loop iteration MUST commit with `experiment:` prefix; after the loop, copy `.autoresearch/results.tsv` into `openspec/changes/validate-podcast-pipeline-with-gooaye/autoresearch/results.tsv`
- [ ] 6.5 Record the winning `--batch-size` and `--retry-backoff-ms` + their commit SHA into `baseline.md` `Stage 5 — tuned defaults`
- [ ] 6.6 Update `src/domain/services/profile-scrape.service.ts` (or a central constants file) so the tuned values become the defaults; update the `ai-pipeline` spec with the SHA and summary link
- [ ] 6.7 Run `npm run type-check` + `npx vitest run` — both green
- [ ] 6.8 Commit as `feat(pipeline): tune concurrency defaults from autoresearch`

## 7. Deliberate Failure Probes (Stage 5 sidebar)

- [ ] 7.1 Inject the two scenarios chosen in §4.4; record pipeline behavior (resume? permanent loss? silent stall?) into `baseline.md` `Stage 2 — failure probes`
- [ ] 7.2 If any probe reveals a latent bug, open a separate OpenSpec change for the fix (do NOT fix in this change) — link it from §7.2

## 8. S4 — Launch-Readiness Run (Stage 6)

- [ ] 8.1 Pre-flight: confirm tuned defaults from §6.5 are applied; `.env.local` has full key pool; Supabase has space; cost estimate printed from §6.5's winning run shows ≤ $30 predicted for 100 eps
- [ ] 8.2 Execute `npx tsx scripts/scrape-guyi-podcast-ep501-600.ts` (no limit — full EP501-600)
- [ ] 8.3 After completion (expect ~3-6 hours), generate summary.json and paste metrics into `baseline.md` `S4` including: actual cost, wall-clock time, success_rate, quality-gate pass rate, failure taxonomy
- [ ] 8.4 Verify every gate in `pipeline-observability` spec's "Public-launch readiness gate" requirement: `success_rate ≥ 95`, `quality_gate_pass_rate ≥ 55`, zero duplicate rows vs S4-dry count, cost within ±20% of §6.5 estimate, no unhandled exception, every failed URL has a logged reason — tick each in `baseline.md` or record the failing gate
- [ ] 8.5 If any gate fails: run `psql ... < scripts/seed-rollback.sql` scoped to Gooaye (`AND kol_id IN (...)`), diagnose in `baseline.md` `Stage 6 — gate failure`, and STOP. Re-attempt only after the diagnosis is addressed.
- [ ] 8.6 If all gates pass: write the launch-readiness declaration at the top of `baseline.md` with the summary.json path + git SHA as evidence; commit `baseline.md` as `docs(baseline): Gooaye pipeline launch-ready`

## 9. Documentation & Archive Prep

- [ ] 9.1 Update `openspec/specs/ai-pipeline/spec.md` via the archive step (do not edit directly — let `/opsx:archive` apply the delta)
- [ ] 9.2 Update `docs/WEB_DEV_PLAN.md` if this completes a phase milestone (e.g., "Pipeline hardening" or "Seed data ready")
- [ ] 9.3 Update `docs/BACKLOG.md` to check off any user story this unlocks (e.g., "populated landing page on day one")
- [ ] 9.4 Write `openspec/changes/validate-podcast-pipeline-with-gooaye/validation.md` listing every test run + SQL check that a reviewer can replay to confirm launch-readiness
- [ ] 9.5 Run `/opsx:archive validate-podcast-pipeline-with-gooaye` (only when all gates pass and commits are pushed)
