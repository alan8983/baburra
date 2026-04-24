# Baseline — validate-podcast-pipeline-with-gooaye

## Run metadata

*Captured at §0.3 of tasks.md. Source: `.env.local` copied from `/c/Cursor_Master/baburra/.env.local` (§0.1).*

| Key | Value |
| --- | --- |
| Worktree | `.claude/worktrees/unruffled-noyce-50ea6c` |
| Branch | `claude/unruffled-noyce-50ea6c` |
| Base commit | `db0b08f` (Session-A close — code-only scope complete) |
| `GEMINI_API_KEYS` pool size | **3** keys (comma-separated) |
| `DEEPGRAM_API_KEY` | Present (single key) |
| Deepgram rate-limit tier | **Pay-as-you-go**, ~$183 USD remaining credit (user-confirmed 2026-04-25). No explicit hard cap on concurrent transcriptions; 429s still possible under bursty load. Tracks Design Q2 — resolved. |
| `TIINGO_API_TOKEN` | Present |
| `SUPABASE_SERVICE_ROLE_KEY` | Present |
| `SUPABASE_ACCESS_TOKEN` | Present |
| `SUPABASE_DB_PASSWORD` | Present |
| `npm install` | Verified — 513 entries in `node_modules`, `next@16.1.6`, `vitest@^4.0.18` resolved |

## Stage 3 — migration verification

**Executed 2026-04-25 (§2.1–§2.5).**

- **§2.1 Migration file contents** (`supabase/migrations/20260406000000_scrape_jobs_allow_validation_scrape.sql`): DROP + re-ADD of `scrape_jobs_job_type_check` to `('initial_scrape','incremental_check','validation_scrape')`. Widens correctly for podcast `validation_scrape`.
- **§2.2 job_type values used in `profile-scrape.service.ts`** (same enum applied regardless of platform):
  - line 306 — `isValidation ? 'validation_scrape' : 'initial_scrape'` (first discovery path)
  - line 393 — read `job.jobType === 'validation_scrape'`
  - line 629 — `'incremental_check'` for cron re-checks
  - All three are covered by the current remote CHECK.
- **§2.3 Remote migration state** (via Supabase MCP `list_migrations` + `execute_sql`):
  - `list_migrations` does NOT show version `20260406000000_scrape_jobs_allow_validation_scrape`, but remote CHECK is `job_type = ANY (ARRAY['initial_scrape','incremental_check','validation_scrape','batch_import'])`.
  - Widening was applied by a later migration — `supabase/migrations/20260411000000_scrape_job_items.sql` DROPs + re-ADDs the constraint including both `validation_scrape` and `batch_import`. That migration is present on remote (as `20260416092358_scrape_job_items`).
  - **Drift noted, not blocking:** local `20260406000000_…` appears never to have been applied under that version string; same effect achieved by the `20260411` migration. No action required for this change. Migration history drift could be cleaned up in a separate chore if desired.
- **§2.4 `--dry-run --limit 1` (live RSS fetch, no DB writes):**
  - **Blocker found + fixed mid-task:** script's hardcoded `GUYI_RSS_FEED` UUID `30cee1f0-4616-46c8-80a8-7bc5a3c7db8b` now returns `404 Not Found`. Canonical UUID from remote `kol_sources.platform_id` is `954689a5-3096-43a4-a80b-7810b219cef3`. Patched `scripts/scrape-guyi-podcast-ep501-600.ts` in this worktree. `npm run type-check` still passes.
  - Second dry-run: feed fetch `200 OK`; parser reports **655 total episodes**, **100 matched to EP501–EP600**; first entry **`EP501 | 🫎`, duration `3121` s (~52 min)**. No DB writes attempted (dry-run returns before `initiateProfileScrape`).
- **§2.5 Open Question Q1 — status: Resolved.** Remote CHECK constraint allows `validation_scrape`; `--dry-run --limit 1` parses cleanly; no new migration required.

## Stage 1 — predict findings

**Executed 2026-04-25 (§3.1–§3.4).**

Report: [predict/260425-1850-gooaye-pipeline/](./predict/260425-1850-gooaye-pipeline/).

Adversarial persona set × deep depth × budget 20 produced **15 findings** (8 confirmed, 5 probable, 2 minority). Anti-herd passed; composite predict_score = 178.

**Top 5 highest-confidence findings** (transcribed for stress-run reference):

1. **F-01 (HIGH, 8/8)** — RSS feed re-fetched in full for every episode (`podcast.extractor.ts:111`). 100 eps × concurrency 3 ≈ 100 identical GETs to SoundOn in seconds. Most likely cause of spurious 429s / socket resets under §5.4 load.
2. **F-02 (HIGH, 7/8)** — Gemini `cooldownQueue` is a global module-level mutex (`gemini.client.ts:115-135`); serializes ALL Gemini calls through a 1500ms gate regardless of key-pool size. Caps practical throughput.
3. **F-03 (HIGH, 7/8)** — No retry on audio download + no AbortController on RSS fetches (`podcast.extractor.ts:194,111`). Single transient 429 drops the episode permanently.
4. **F-04 (HIGH, 6/8)** — Key-pool 429 backoff retries already-exhausted keys (`gemini.client.ts:169-231`); the 5s initial backoff is strictly shorter than Flash-Lite's per-minute quota window. Wastes retry budget.
5. **F-14 (MEDIUM, 5/8)** — `extractArguments` per-ticker failures silently swallowed (`import-pipeline.service.ts:725-754`); posts land with zero arguments for some tickers while `argumentsOk` reports true. Masks quality-gate failures.

Tuning candidates for §6 (high/critical findings below opened as checkboxes):

## Stage 2 — failure scenarios

**Executed 2026-04-25 (§4.1–§4.4).**

Report: [scenario/260425-1855-gooaye-scale/](./scenario/260425-1855-gooaye-scale/). 25 scenarios generated across 5 dimensions (concurrent, scale, recovery, temporal, composite). 1 critical, 7 high, 9 medium, 8 low.

**Top 10 deliberate-probe candidates** (filtered to the four focus dimensions per §4.3):

| Rank | ID | Dim | Severity | Scenario |
| --- | --- | --- | --- | --- |
| 1 | S-23 | composite | CRITICAL | F-01 + F-03 compound — RSS 429 with no retry drops episode |
| 2 | S-01 | concurrent | HIGH | SoundOn RSS rate-limits at burst of 3 identical GETs |
| 3 | S-02 | concurrent | HIGH | Gemini `cooldownQueue` mutex serializes parallel Gemini calls |
| 4 | S-16 | recovery | HIGH | Gemini key-pool all-429 triggers 155s backoff cycle |
| 5 | S-19 | temporal | HIGH | Per-minute quota reset vs 5s initial backoff mismatch |
| 6 | S-24 | composite | HIGH | F-02 + F-04 compound — cooldown serializes a 429 cascade |
| 7 | S-07 | scale | MED | Multi-day ≥5-run traffic may trip SoundOn unwritten daily cap |
| 8 | S-08 | scale | MED | Audio buffer heap pressure at batch-size 10 (~500 MB peak) |
| 9 | S-13 | recovery | MED | SIGINT miscounts imported vs duplicate; DB-row integrity preserved |
| 10 | S-21 | temporal | MED | Signed enclosure URL expiry between discovery and download |

**Two injection-ready probes selected for §7** (per §4.4 — must be free or ≤$2):

- **P-01** (S-01 / S-23): locally intercept `fetch()` for SoundOn feed URL → return 429 every 3rd call. Observes whether retries absorb the burst. **Cost: $0.**
- **P-02** (S-13): SIGINT mid-batch + restart; verify `duplicate` counter on restart equals the SIGINT-interrupted count and DB post-count is correct. **Cost: ~$1–2** (one real Deepgram call, no double-post).

## Stage 2 — failure probes

*Pending §7.1–§7.2.*

## S1-dry / S1 / S2 / S3 / S3-serial-rerun / S3-parallel-rerun

*Pending §5.1–§5.7.*

## Stage 5 — tuned defaults

*Pending §6.1–§6.8.*

## S4

*Pending §8.1–§8.6.*
