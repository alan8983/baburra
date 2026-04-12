## Context

`profile-scrape.service.ts` orchestrates YouTube / Twitter / Podcast / TikTok / Facebook discovery → extraction → AI pipeline → DB write. The service follows an **async job model** (since PR #65):
1. `initiateProfileScrape()` creates a `scrape_job` + `scrape_job_items` and returns immediately.
2. `processJobBatch(jobId)` processes N URLs per call, driven by frontend polling via `/api/scrape/jobs/[id]/continue`.

The import pipeline (`import-pipeline.service.ts`) runs the Gemini/Gemma extraction + quality gate on every URL and charges **lego credit blocks** (since PR #56) per operation (discovery, download, transcription, AI analysis). Validation scrapes already pass `quotaExempt: true` to bypass credit charges.

YouTube URLs use a built-in **bounded semaphore** (3 concurrent by default, tunable via `YOUTUBE_SCRAPE_CONCURRENCY`, since PR #65). Per-URL progress is tracked via `scrape_job_items` with stage transitions pushed over Supabase Realtime.

AI analysis uses a **Gemma 4 → Gemini fallback chain** (since PR #59), transparent to callers.

Extractors live in `src/infrastructure/extractors/` and already support historical depth (they take a max-URLs parameter in their discovery phase). `initiateProfileScrape()` accepts `selectedUrls?: string[]` to filter which discovered URLs to process.

Constraints:
- Windows dev env, Node 20+, `ts-node`/`tsx` already used in `scripts/` (check and use the existing runner convention).
- Gemini + Deepgram + Tiingo keys live in `.env.local`. YouTube Data API quota is 10K units/day; 12 channels × 50 videos ≈ 600 units for listing — well within budget.
- Supabase Row Level Security is bypassed by `createAdminClient()`; the script must use the admin client exclusively.

## Goals / Non-Goals

**Goals:**
- Seed 19 curated KOLs with 30–50 historical posts each before launch, reusing the production pipeline verbatim so quality-gate behavior in prod matches what seed data experienced.
- Idempotent re-runs so a crash mid-batch is recovered by simply re-running.
- Zero UI changes; zero schema breakage for existing consumers.
- Distinguishable seed data for later cleanup or analytics (`source='seed'`).

**Non-Goals:**
- Automated / scheduled ingestion (separate change).
- Fixing Podcast UI `detectPlatform()` (BUG-001) — script calls service layer, so UI is irrelevant.
- TikTok / Facebook seeding — not in the 19-KOL list and would require Apify credits.
- Backfilling price history beyond what `stock-price.repository.ts` already hydrates post-import.

## Decisions

### D1: Script drives the async job model directly, not via API routes
**Why:** No auth, no HTTP overhead, no UI dependency, no rate limiting. The script calls `initiateProfileScrape()` to create a scrape job, then loops `processJobBatch(jobId)` until the job reaches `'completed'` status — reusing the same code path the frontend uses, including per-URL progress tracking via `scrape_job_items`, YouTube parallelism, and credit handling.
**Alternatives:** (a) Hit local `/api/scrape/*` endpoints with a service-role cookie — rejected, more moving parts. (b) A SQL-only seed via `supabase/seed.sql` — rejected, bypasses the AI pipeline which is exactly what we want to exercise. (c) Call `processUrl()` from `import-pipeline.service` directly — rejected, would duplicate KOL creation, job tracking, and concurrency management logic already in the scrape service.

### D2: Ownership via dedicated `platform` auth user, NOT nullable `userId`
**Why:** Making `userId` nullable is a breaking schema change that ripples into every query, RLS policy, and type generation. Creating one real auth user (`platform@baburra.com`, random password, never logged into) keeps all existing invariants, requires only an idempotent `INSERT ... ON CONFLICT DO NOTHING` migration, and lets the service layer stay unchanged.
**Alternatives:** Nullable userId — rejected for blast radius. Separate `platform_*` mirror tables — rejected, over-engineered.
**How to apply:** Migration inserts the row into `auth.users` (via Supabase admin API in a data-migration script) and stores the resulting UUID in a new `platform_constants` row or a hard-coded env var `PLATFORM_USER_ID` the script reads.

### D3: `source` column on `kol_sources` and `posts`, default `'user'`
**Why:** Cheap to add (nullable TEXT with a CHECK constraint), defaults mean no existing rows need backfill, and it unblocks future analytics ("what % of our Layer 3 coverage is platform-seeded?"). Storing it on `kol_sources` (the KOL-platform identity table) lets us query at the scrape-source level; storing it on `posts` lets us filter at the post level for mixed-source KOLs after launch. Note: `profile_scrapes` does not exist — scrape state lives in `kol_sources` and `scrape_jobs`.
**Alternatives:** Booleans `isSeed` — rejected, less extensible. Dedicated `seed_runs` table — rejected, YAGNI.

### D4: Service accepts `{ ownerUserId?, source?, quotaExempt? }` overrides; `selectedUrls` controls depth
**Why:** `initiateProfileScrape()` already accepts `selectedUrls?: string[]` to whitelist which discovered URLs to process. The seed script can call discovery, slice the results to `config.maxPosts`, and pass that slice as `selectedUrls` — no new `maxPosts` parameter needed. We thread three new optional fields through the service: `ownerUserId` (platform user UUID), `source` (`'seed'`), and `quotaExempt` (`true` to bypass the lego credit system). Defaulting to current behavior means API routes are untouched.
**How to apply:** Add an optional `ScrapeOverrides` object to `initiateProfileScrape()` and `processJobBatch()`. The overrides flow through to `processUrl()` in the import pipeline. The `quotaExempt` flag already exists in `processUrl()` — we just need to thread it from the scrape service caller.

### D5: Idempotency keys — `(platform, platformId)` for KOL sources, `sourceUrl` for posts
**Why:** Both already exist in the schema. `kol_sources` has `(platform, platform_id)` uniqueness enforced by `findOrCreateSource()` in `kol-source.repository.ts`. `findPostBySourceUrl()` in `post.repository.ts` is already used by the import pipeline for duplicate detection. `initiateProfileScrape()` already calls `findOrCreateSource()` internally, so idempotency at the KOL level is handled by the existing service — the script just needs to check if a source already has `source='seed'` to decide whether to skip it entirely.

### D6: Error handling — per-post try/catch, log to JSONL, continue
**Why:** A single broken video (e.g., age-restricted, deleted, transcript unavailable) must not tank the batch. Errors are appended to `scripts/logs/seed-errors-<timestamp>.jsonl` with `{ kol, url, phase, error }`. The KOL-level summary also increments an error counter.
**Trade-off:** We accept that a broken YouTube API key would produce a log full of identical errors — the script prints a warning if the error rate crosses 50% and asks the operator to confirm continuing.

### D7: Sequential execution across KOLs; within-KOL concurrency delegated to service
**Why:** YouTube Data API quota and Gemini RPM limits. Running all 19 KOLs in parallel would burst-fire Gemini at 19× its per-request concurrency. Within a KOL, `processJobBatch()` already manages concurrency internally: YouTube URLs use a bounded semaphore (default 3, tunable via `YOUTUBE_SCRAPE_CONCURRENCY`), non-YouTube URLs use `batchSize`-based parallelism, and per-item progress writes are serialized via promise chains. The seed script does not need to manage concurrency — it just loops `processJobBatch()` calls sequentially per KOL.

### D8: Seed config is a checked-in JSON file, handle validation is lazy
**Why:** `seed-kol-config.json` lives next to the script so it's version-controlled and reviewable. Handles from the candidates list (YouTube `@xxx`, Twitter `@xxx`, Podcast RSS URL) are validated only when the extractor actually runs — if one handle is wrong, the operator fixes it and re-runs (idempotency protects prior KOLs).

### D9: Credit exemption via `quotaExempt: true`, not platform user tier
**Why:** The lego credit system (PR #56) charges per-operation credits via `consumeCredits()` in `processUrl()`. The platform user has no real subscription and no credit balance. Rather than assigning an artificial tier or unlimited credits, we pass `quotaExempt: true` through the scrape overrides — the same mechanism validation scrapes already use. This is the lightest touch: no migration, no special-case tier logic, and it's already battle-tested.
**Alternatives:** (a) Give platform user `Max` tier (25K credits/month) via migration — rejected, artificial and could run out on large seed runs. (b) Skip credit checks in the script by patching the service — rejected, violates "reuse the production pipeline verbatim" goal.

### D10: Per-URL progress via `scrape_job_items`, not custom logger
**Why:** PR #65 added `scrape_job_items` with per-URL stage tracking (queued → discovering → downloading → transcribing → analyzing → done/failed). Since the seed script drives the job model, it gets this tracking for free. The script reads job items after each `processJobBatch()` call to build CLI progress output, replacing the originally proposed custom `seed-logger.ts` with a thin wrapper that reads from the existing data. Error logging to JSONL still applies for post-mortem analysis, but live progress comes from the job items table.

## Risks / Trade-offs

- **[Risk]** YouTube Data API daily quota (10K units) exhausted mid-run → **Mitigation**: script exits cleanly with "quota exceeded" error, operator resumes next day; idempotency means already-seeded KOLs are skipped.
- **[Risk]** Deepgram transcription cost for long YouTube videos blows past free credit → **Mitigation**: the $200 free credit covers ~46K minutes; seed load is ~12K minutes, so we have 3.8× headroom. Print running transcription-minute total per KOL.
- **[Risk]** Some historical posts have no transcript and no captions → **Mitigation**: existing extractor already falls back to Deepgram; if that also fails, the post is logged and skipped.
- **[Risk]** Quality gate pass-rate on historical content is lower than the 60% modeled for fresh content → **Mitigation**: we target ≥55% and manually spot-check 10% of passed posts before declaring done.
- **[Risk]** Script crashes mid-write leaving a KOL half-populated → **Mitigation**: re-run; `findPostBySourceUrl` deduplicates at the post level.
- **[Trade-off]** We add a `source` column to `kol_sources` and `posts`. The migration is defaulted and nullable, so zero downtime, but future queries that GROUP BY source must remember to handle NULL as `'user'`.
- **[Trade-off]** Seed data is subject to the same L2/L3 content unlock gating (PR #60) as user data. This is intentional — seed data populates the catalogue, but users still unlock individual KOL-ticker or stock-page views based on their subscription tier. If we later want seed data to be freely visible, a migration can mark those unlocks.

## Migration Plan

1. Land the migration adding `source` column to `kol_sources` and `posts` + platform user insert (reviewable as a normal PR, no data loss).
2. Regenerate `database.types.ts` and run `npm run type-check`.
3. Add service overrides (`ownerUserId`, `source`, `quotaExempt`) and the seed script in the same PR or a follow-up.
4. Run `npm run seed:scrape -- --dry-run` against local Supabase; inspect summary.
5. Run without `--dry-run` against the staging Supabase project, spot-check 10% of posts.
6. Run against production Supabase. Capture summary + error log as an artifact in the PR.
7. Rollback: delete rows where `source='seed'` via a scripted SQL (included in the repo under `scripts/seed-rollback.sql`). The `source` column itself stays — harmless default.

## Open Questions

- Should the platform user UUID be committed as a constant in `src/lib/constants/` or injected via env? Leaning constant, because it's stable and public-safe.
