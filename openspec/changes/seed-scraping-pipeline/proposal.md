## Why

New users land on an empty database. Layer 1 (aggregate stats) and Layer 3 (Stock Page cross-KOL comparison) are both unusable until enough KOLs have been scraped, so first-time visitors bounce before they see the product's core value. We need a repeatable, pre-launch batch ingestion that seeds the DB with 19 curated KOLs and ~600+ historical posts so the platform already *looks* populated on day one.

## What Changes

- Add a one-shot Node script (`npm run seed:scrape`) that reads a checked-in `seed-kol-config.json` and, for each KOL, calls the existing `profile-scrape.service` directly — bypassing API routes, auth, HTTP overhead, and the still-broken Podcast UI `detectPlatform()`.
- Introduce a "platform system user" identity so seed-sourced `kols`, `profile_scrapes`, and `posts` rows have a valid owner without belonging to any real user. Concrete approach (nullable `userId` vs. dedicated `platform@baburra.com` auth user) is decided in design.md after inspecting the schema.
- Add a `source` marker (`'seed' | 'user'`) on profile-scrape / post rows so seed-sourced data can be distinguished from organic user contributions for later analytics or cleanup.
- Extend `profile-scrape.service` (or add a thin wrapper) to accept an explicit `maxPosts` override and an `ownerUserId` override so the script can request 30–50 historical posts per KOL instead of the default incremental depth.
- Quality gate, content filter, AI sentiment extraction, and price-change hydration stay untouched — seed data must clear the same bar as user-submitted data.
- Idempotent execution: re-running the script skips KOLs/posts already in DB (by platform identifier + source URL) so partial crashes recover by simply re-running.
- Error handling: single-post failures are logged to `seed-errors.log` and skipped; a per-KOL + overall summary report is emitted to stdout on completion.

## Capabilities

### New Capabilities
- `seed-ingestion`: Pre-launch batch ingestion pipeline — config-driven seed KOL list, system-user ownership, historical-depth scrape, idempotent re-runs, per-post error isolation, and the success criteria (≥17/19 KOLs landed, ≥600 posts passed quality gate, ≥5 tickers with ≥3 covering KOLs).

### Modified Capabilities
- `data-models`: Add `source` column on `profile_scrapes` and `posts` (default `'user'`), and document the platform system user row / nullable-owner rule.
- `ai-pipeline`: Document that `profile-scrape.service` exposes `maxPosts` and `ownerUserId` overrides and that the quality gate is applied uniformly regardless of source.

## Impact

- **New code**:
  - `scripts/seed-scrape.ts` — CLI entrypoint
  - `scripts/seed-kol-config.json` — 19-KOL seed list from `baburra-seed-kol-candidates.md`
  - `scripts/lib/seed-logger.ts` — per-KOL + overall summary + error log
- **Modified code**:
  - `src/domain/services/profile-scrape.service.ts` — accept `maxPosts` and `ownerUserId` overrides; thread through to extractor calls
  - `src/infrastructure/repositories/profile.repository.ts` / `post.repository.ts` — accept and persist `source` field; allow system-user writes
  - `supabase/migrations/<new>_add_source_and_system_user.sql` — add `source` column, seed the platform system user row
  - `package.json` — add `seed:scrape` npm script
- **Docs**:
  - `openspec/specs/data-models/spec.md` — `source` column + platform user
  - `openspec/specs/ai-pipeline/spec.md` — note scrape-service override parameters
- **Dependencies**: no new runtime deps. Deepgram + Gemini + Tiingo keys must be present in `.env.local` when running the script. Estimated one-time cost ≈ $51 (covered by Deepgram free credit).
- **Not in scope**: cron automation, UI changes, BUG-001 fix (Podcast `detectPlatform`), BUG-004 (`APIFY_API_TOKEN` check), TikTok/Facebook seeding.
