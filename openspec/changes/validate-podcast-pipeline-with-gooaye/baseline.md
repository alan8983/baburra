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

*Pending §3.1–§3.4.*

## Stage 2 — failure scenarios

*Pending §4.1–§4.4.*

## Stage 2 — failure probes

*Pending §7.1–§7.2.*

## S1-dry / S1 / S2 / S3 / S3-serial-rerun / S3-parallel-rerun

*Pending §5.1–§5.7.*

## Stage 5 — tuned defaults

*Pending §6.1–§6.8.*

## S4

*Pending §8.1–§8.6.*
