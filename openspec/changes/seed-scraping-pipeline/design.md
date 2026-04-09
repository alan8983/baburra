## Context

`profile-scrape.service.ts` already orchestrates YouTube / Twitter / Podcast / TikTok / Facebook discovery → extraction → AI pipeline → DB write. The service is invoked today only via the `POST /api/scrape/*` routes, which require an authenticated `userId`. Seed ingestion is a one-off, local, pre-launch operation — we want to reuse the service but skip auth and run it from Node directly.

Extractors live in `src/infrastructure/extractors/` and already support historical depth (they take a max-URLs parameter in their discovery phase). The import pipeline (`import-pipeline.service.ts`) runs the Gemini extraction + quality gate on every URL; that logic must not be bypassed.

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

### D1: Script calls `profile-scrape.service` directly, not via API routes
**Why:** No auth, no HTTP overhead, no UI dependency, no rate limiting. Imports work in plain Node because the service already uses `createAdminClient()` through the repositories.
**Alternatives:** (a) Hit local `/api/scrape/*` endpoints with a service-role cookie — rejected, more moving parts. (b) A SQL-only seed via `supabase/seed.sql` — rejected, bypasses the AI pipeline which is exactly what we want to exercise.

### D2: Ownership via dedicated `platform` auth user, NOT nullable `userId`
**Why:** Making `userId` nullable is a breaking schema change that ripples into every query, RLS policy, and type generation. Creating one real auth user (`platform@baburra.com`, random password, never logged into) keeps all existing invariants, requires only an idempotent `INSERT ... ON CONFLICT DO NOTHING` migration, and lets the service layer stay unchanged.
**Alternatives:** Nullable userId — rejected for blast radius. Separate `platform_*` mirror tables — rejected, over-engineered.
**How to apply:** Migration inserts the row into `auth.users` (via Supabase admin API in a data-migration script) and stores the resulting UUID in a new `platform_constants` row or a hard-coded env var `PLATFORM_USER_ID` the script reads.

### D3: `source` column on `profile_scrapes` and `posts`, default `'user'`
**Why:** Cheap to add (nullable TEXT with a CHECK constraint), defaults mean no existing rows need backfill, and it unblocks future analytics ("what % of our Layer 3 coverage is platform-seeded?"). Storing it on both tables lets us query at the profile level (for the summary report) and at the post level (for mixed-source KOLs after launch).
**Alternatives:** Booleans `isSeed` — rejected, less extensible. Dedicated `seed_runs` table — rejected, YAGNI.

### D4: Service accepts `{ maxPosts?, ownerUserId?, source? }` override
**Why:** The public signature today hard-codes `userId` from request context and `maxPosts` from the default incremental setting. We thread three optional fields through the existing `initiateScrape` / `runBatch` entry points — no new entry point, no duplicated logic.
**How to apply:** Defaulting to current behavior means API routes are untouched; only the seed script sets the overrides.

### D5: Idempotency keys — `(platform, platformId)` for KOLs, `sourceUrl` for posts
**Why:** Both already exist in the schema (`kols.platform_id`, `posts.source_url`). `findKolByName` is replaced in the seed path by `findOrCreateKolByPlatformId` (a thin new helper that already exists conceptually in `kol.repository` as `findOrCreateSource` for the source table — we'll mirror it at the KOL level). `findPostBySourceUrl` is already used by the import pipeline for duplicate detection.

### D6: Error handling — per-post try/catch, log to JSONL, continue
**Why:** A single broken video (e.g., age-restricted, deleted, transcript unavailable) must not tank the batch. Errors are appended to `scripts/logs/seed-errors-<timestamp>.jsonl` with `{ kol, url, phase, error }`. The KOL-level summary also increments an error counter.
**Trade-off:** We accept that a broken YouTube API key would produce a log full of identical errors — the script prints a warning if the error rate crosses 50% and asks the operator to confirm continuing.

### D7: Sequential execution across KOLs, bounded concurrency within a KOL
**Why:** YouTube Data API quota and Gemini RPM limits. Running all 19 KOLs in parallel would burst-fire Gemini at 19× its per-request concurrency. Within a KOL, the existing pipeline already batches 3–5 URLs at a time; we keep that unchanged.

### D8: Seed config is a checked-in JSON file, handle validation is lazy
**Why:** `seed-kol-config.json` lives next to the script so it's version-controlled and reviewable. Handles from the candidates list (YouTube `@xxx`, Twitter `@xxx`, Podcast RSS URL) are validated only when the extractor actually runs — if one handle is wrong, the operator fixes it and re-runs (idempotency protects prior KOLs).

## Risks / Trade-offs

- **[Risk]** YouTube Data API daily quota (10K units) exhausted mid-run → **Mitigation**: script exits cleanly with "quota exceeded" error, operator resumes next day; idempotency means already-seeded KOLs are skipped.
- **[Risk]** Deepgram transcription cost for long YouTube videos blows past free credit → **Mitigation**: the $200 free credit covers ~46K minutes; seed load is ~12K minutes, so we have 3.8× headroom. Print running transcription-minute total per KOL.
- **[Risk]** Some historical posts have no transcript and no captions → **Mitigation**: existing extractor already falls back to Deepgram; if that also fails, the post is logged and skipped.
- **[Risk]** Quality gate pass-rate on historical content is lower than the 60% modeled for fresh content → **Mitigation**: we target ≥55% and manually spot-check 10% of passed posts before declaring done.
- **[Risk]** Script crashes mid-write leaving a KOL half-populated → **Mitigation**: re-run; `findPostBySourceUrl` deduplicates at the post level.
- **[Trade-off]** We add a `source` column to two hot tables. The migration is defaulted and nullable, so zero downtime, but future queries that GROUP BY source must remember to handle NULL as `'user'`.

## Migration Plan

1. Land the migration adding `source` column + platform user insert (reviewable as a normal PR, no data loss).
2. Regenerate `database.types.ts` and run `npm run type-check`.
3. Add service overrides and the seed script in the same PR or a follow-up.
4. Run `npm run seed:scrape -- --dry-run` against local Supabase; inspect summary.
5. Run without `--dry-run` against the staging Supabase project, spot-check 10% of posts.
6. Run against production Supabase. Capture summary + error log as an artifact in the PR.
7. Rollback: delete rows where `source='seed'` via a scripted SQL (included in the repo under `scripts/seed-rollback.sql`). The `source` column itself stays — harmless default.

## Open Questions

- Does `scripts/` already have a runner convention (`tsx`, `ts-node`, or compiled JS)? Implementation task will use whatever the existing one-off scripts use.
- Should the platform user UUID be committed as a constant in `src/lib/constants/` or injected via env? Leaning constant, because it's stable and public-safe.
