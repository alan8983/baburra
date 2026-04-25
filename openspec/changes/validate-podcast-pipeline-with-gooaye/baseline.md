# Baseline — validate-podcast-pipeline-with-gooaye

## Session handoff (2026-04-25, Session B)

**Stopping point:** §5 complete and committed. §6–§8 to be driven from a fresh session.

**Where to resume:**

1. Read this file top-to-bottom — the §5 summary table names every gate's status and every open bug.
2. Next task is **§6 autoresearch tuning** (`openspec/changes/validate-podcast-pipeline-with-gooaye/tasks.md` §6.1–6.8). Budget ~$32 and 4–6 h wall time for a 15-iteration loop over 10-ep samples.
3. Before resuming, consider whether to short-circuit: the current defaults already produce 100% idempotency + 71% fresh success_rate on a 10-ep sample; the highest-value unresolved bug is **D4** ([#91](https://github.com/alan8983/baburra/issues/91) — duplicate tickers from Gemini). A targeted D4 fix + direct §8 run may reach the 95% launch-readiness gate faster than a full §6 tuning pass.
4. Whichever path is chosen, the 4 tuning candidates **6.T1–6.T4** in `tasks.md §3.4` (RSS feed cache, Gemini cooldown per-key, audio-download retry helper, Gemini key-cooldown marker) remain valid follow-ups.

**Environment state:**

- `.env.local` present in worktree root (7 keys; Gemini pool size 3; Deepgram Pay-as-you-go ~$183 credit at session start)
- `node_modules` installed (513 entries)
- Supabase linked via `supabase/.temp/project-ref = jinxqfsejfrhmvlhrfjj`
- DB: 12 Gooaye podcast posts seeded (`kol_id = b7a958c4-f9f4-48e1-8dbf-a8966bf1484e`), all with canonical `podcast-rss://…` `source_url`. `kol_sources.source = 'seed'` is set. `posts.source` is NULL pending the D2 ([#89](https://github.com/alan8983/baburra/issues/89)) migration.

**Commit trail this session:**

| SHA | What |
| --- | --- |
| `d20c8b0` | §0 preconditions + §2 migration verification + patch stale RSS UUID |
| `3f6d016` | §3 predict — 15 findings from 8 adversarial personas |
| `2c065c1` | §4 scenarios — 25 failure scenarios across 5 dimensions |
| `b1d03b3` | §5.2–5.3 baseline entry — 3 bugs surfaced (D1/D2/D3) |
| `2d1c1ef` | D1 fix — podcast `sourceUrl` aligned on podcast-rss:// key |
| `8c7ecfa` | §5.4–5.6 baseline entry — idempotency gates passed, D4 filed |

**Open bugs (GitHub issues, not blocking §6):**
- D2 [#89](https://github.com/alan8983/baburra/issues/89) `posts.source` never written → rollback script inert.
- D3 [#90](https://github.com/alan8983/baburra/issues/90) `completeScrapeJob` aborts script on Supabase fetch blip.
- D4 [#91](https://github.com/alan8983/baburra/issues/91) duplicate tickers from Gemini → `post_stocks` constraint violation.

---

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

### S1-dry (§5.1 — satisfied by §2.4)
655 feed entries, 100 EP501-600 matched, first=`EP501 | 🫎` (3121s). No DB writes.

### S1 — `--limit 1` (live, 2026-04-25 03:08 local)

- Summary: [seed-run-2026-04-24T19-05-20-114Z.summary.json](../../../scripts/logs/seed-run-2026-04-24T19-05-20-114Z.summary.json)
- Result: **1/1 passed, success_rate 100%**
- Stages (p50): rss_lookup 40.6s · gemini_sentiment 48.9s (retries=5, matches F-04) · gemini_args 58.7s · supabase_write 1.3s
- DB: 1 post (`798c41cf...`), EP501, kol=Gooaye (`b7a958c4...`), 20 tickers, 72 arguments, sentiment=1 (bullish).
- **Note:** `rss_lookup` stage-timing label is misleading — it covers the full podcast extractor (RSS fetch + audio download + Deepgram transcription). Deepgram is not separately timed on the podcast path. Instrumentation gap to address in a follow-up.

### S2 — `--limit 3 --batch-size 3` (live, 2026-04-25 03:14 local)

- Summary: [seed-run-2026-04-24T19-14-40-792Z.summary.json](../../../scripts/logs/seed-run-2026-04-24T19-14-40-792Z.summary.json) (partial: true — script exited abnormally, see D3 below)
- Result: **2/3 passed (EP502, EP503), 1 error (EP501 duplicate), success_rate 66.7%**
- Stages (p50 / p95): rss_lookup 161.6s / 167.5s · gemini_sentiment 12.9s / 19.7s (retries=0) · gemini_args 49.8s / 56.0s · supabase_write 0.9s / 1.0s
- DB net: +2 posts (EP502, EP503), total seed-run posts on Gooaye = 3.

### Bugs discovered during S1+S2 (summary)

| Id | Severity | Where | Impact | Fix size |
| --- | --- | --- | --- | --- |
| **D1** Podcast dedup asymmetry | HIGH | `import-pipeline.service.ts:372` + `podcast.extractor.ts:153` | `findPostBySourceUrl(podcast-rss://…)` never matches the stored enclosure URL, so re-runs pay full Deepgram cost before the unique constraint catches them at INSERT. Blocks §5.5 cheap idempotency. | 1-2 lines |
| **D2** `posts.source` never populated | HIGH | `create_post_atomic` RPC lacks `p_source` param; pipeline passes nothing | `scripts/seed-rollback.sql` queries `WHERE source='seed'` — matches 0 rows; rollback effectively broken | Migration + RPC + code (medium) |
| **D3** `completeScrapeJob` aborts script on Supabase fetch blip | MEDIUM | `scrape-job.repository.ts:195` via `profile-scrape.service.ts:561` | Network blip throws out of `processJobBatch`, kills the script (`process.exit(1)`). Posts committed, but `scrape_jobs.status` stuck in `processing`. | Add retry wrapper (small) |

Empirical vs predict match-up:

- ✅ **F-04 confirmed (retries=5 on S1 gemini_sentiment)** — but matrix self-heals on next run (retries=0 on S2). Not blocking.
- ⚠️ **F-02 partially observed** — S2 gemini_args p95 ≈ 56s for 13 tickers × 3 concurrent episodes. Cooldown mutex impact real but tolerable at batch-size 3.
- ❌ **F-01 NOT observed yet** — SoundOn did not 429 on 3× concurrent RSS fetches. Possibly F-01 doesn't bite until batch-size ≥ 5 or under sustained load. Re-evaluate at §5.4.
- ➕ **NEW D1 + D2 + D3 found** — not in predict scope (predict focused on concurrency/429/timeout; these are correctness/observability).

### Recommendation (before §5.4 / §5.5)

1. **Fix D1 (required for §5.5 idempotency proof).** 1-line change: in `processUrl`, store `source_url = url` (the podcast-rss:// URL passed in) instead of `fetchResult.sourceUrl` for podcast platform — OR normalize in the extractor. After fix, re-verify §5.5.
2. **Defer D2 to a separate change.** Scope: migration to `create_post_atomic` signature + repository + rollback script. Affects multiple callers.
3. **Defer D3 to the same follow-up change as D2** — or wrap `completeScrapeJob` in 1-retry-with-2s-backoff inline. Low-priority since posts are correct; job-status housekeeping only.

**§5.4/§5.5 proceed-decision:** blocked on D1 for cheap idempotency. User decision needed.

### Post-D1-fix: DB cleanup

- Deleted the 3 S1/S2 test posts (they stored enclosure URL + `source=NULL`, making them incompatible with the new key format).
- `UPDATE posts SET source_url = 'podcast-rss://…#{guid}' WHERE id IN (…)` on the 5 pre-existing Gooaye podcast posts (EP504, 505, 506, 513, 524 from Apr-16 testing) so the new D1 pre-check would short-circuit them.

### S3 — §5.4 `--limit 10 --batch-size 3` (live, post-D1-fix, 2026-04-25 03:36 local)

- Summary: [seed-run-2026-04-24T19-36-02-758Z.summary.json](../../../scripts/logs/seed-run-2026-04-24T19-36-02-758Z.summary.json) — attempted 10, passed 5, duplicates 3, errors 2, **success_rate 50%** (excluding dups from numerator).
- DB: 10 podcast posts for Gooaye (EP501, 502, 503, 504, 505, 506, 509, 510, 513, 524). Missing: EP507, EP508.
- Stages (p50 / p95 across 5 fresh URLs): rss_lookup 46.5 / 51.6s · gemini_sentiment 5.0 / 25.0s · gemini_args 147.9 / 202.7s · supabase_write 1.6 / 2.6s
- **D1 fix verified** — EP504/505/506 were cleanly caught at the pre-extract `findPostBySourceUrl` check (zero Deepgram/Gemini cost).
- **Errors:**
  - EP507 — `fetch failed` (transient; not reproduced on §5.5 rerun)
  - EP508 — `duplicate key value violates unique constraint "post_stocks_post_id_stock_id_key"` → new bug **D4** filed as [baburra#91](https://github.com/alan8983/baburra/issues/91). Gemini returned a duplicate ticker in `analysis.stockTickers`; pipeline forwarded it twice to `create_post_atomic`.
- **Non-fatal quality-gate signal** — log line `extractArguments failed for BTC: Gemini API request timed out after 30000ms` observed mid-run. Silently swallowed per predict F-14; post still written with arguments from the other tickers. Matches prediction.
- **Predict match-up after S3:**
  - ✅ F-03 concretely observed (EP507 `fetch failed`)
  - ✅ F-14 concretely observed (BTC argument-extraction 30s timeout, silently dropped)
  - ⚠️ F-02 moderate impact — `gemini_args` p95 = 202.7s at B=3, cooldown mutex real
  - ➕ **NEW D4** (duplicate ticker → post_stocks constraint) not in predict scope

### S3-serial-rerun — §5.5 `--limit 10 --batch-size 1` (2026-04-25 03:49 local)

- Summary: [seed-run-2026-04-24T19-49-50-728Z.summary.json](../../../scripts/logs/seed-run-2026-04-24T19-49-50-728Z.summary.json) — attempted 10, passed 2 (EP507 + EP508, retry success), duplicates **8**, errors 0.
- Wall time: **152s** for 10 episodes — 8 short-circuits were near-instant; the 2 fresh-retry episodes took ~60s each.
- **EP507 + EP508 both succeeded on rerun** — confirms F-03's transient nature for EP507 and D4's non-determinism for EP508 (Gemini output for EP508 this run had 14 unique tickers, no duplicates). EP508 log line `extractArguments failed for BTC: timed out` observed again — same F-14 behavior.
- **§5.5 idempotency gate — PASSED for the 8 previously-seeded episodes (0 new posts, 8 clean duplicates).**

### S3-parallel-rerun — §5.6 `--limit 10 --batch-size 3` (2026-04-25 03:55 local)

- Summary: [seed-run-2026-04-24T19-55-47-707Z.summary.json](../../../scripts/logs/seed-run-2026-04-24T19-55-47-707Z.summary.json) — attempted 10, passed 0, duplicates **10**, errors 0.
- Wall time: **5 seconds** for 10 episodes — pure pre-check short-circuit. No Deepgram, no Gemini.
- **§5.6 idempotency gate — PASSED (pure 0-new-posts, 10 duplicates).**
- DB count unchanged: 12 Gooaye podcast posts (pre-existing 5 + fresh 5 from S3 + 2 from S3-serial-rerun).

### §5 summary

| Gate | Status | Notes |
| --- | --- | --- |
| §5.1 S1-dry | ✅ pass | See §2.4 |
| §5.2 S1 | ✅ pass | 1/1, 100% |
| §5.3 S2 | ⚠️ partial | 2/3; surfaced D1/D2/D3 (all filed/fixed) |
| §5.4 S3 | ⚠️ partial | 5/10 fresh success; EP507 transient, EP508 D4; D1 fix verified |
| §5.5 S3-serial-rerun | ✅ **pass** | 8/8 idempotent dup; 2 genuinely-new attempts succeeded on retry |
| §5.6 S3-parallel-rerun | ✅ **PASS** | 10/10 dup in 5s — pure idempotency proof |
| §5.7 Proceed? | ✅ yes | All idempotency gates met; proceed to §6 |

**Bugs still open:** D2 ([#89](https://github.com/alan8983/baburra/issues/89)), D3 ([#90](https://github.com/alan8983/baburra/issues/90)), D4 ([#91](https://github.com/alan8983/baburra/issues/91)) — all in separate GitHub issues, none blocking §6.

## Stage 5 — tuned defaults

*Pending §6.1–§6.8.*

## S4

*Pending §8.1–§8.6.*
