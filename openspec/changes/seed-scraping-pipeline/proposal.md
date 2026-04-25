## Why

New users land on an empty database. Layer 1 (aggregate stats) and Layer 3 (Stock Page cross-KOL comparison) are both unusable until enough KOLs have been scraped, so first-time visitors bounce before they see the product's core value. We need a repeatable, pre-launch batch ingestion that seeds the DB with 19 curated KOLs and ~600+ historical posts so the platform already *looks* populated on day one.

## What Changes

- Add a one-shot Node script (`npm run seed:scrape`) that reads a checked-in `seed-kol-config.json` and, for each KOL, drives the existing async job pipeline — calling `initiateProfileScrape()` to create a scrape job, then looping `processJobBatch()` until completion — bypassing API routes, auth, HTTP overhead, and the still-broken Podcast UI `detectPlatform()`.
- Introduce a "platform system user" identity so seed-sourced `kols`, `kol_sources`, `scrape_jobs`, and `posts` rows have a valid owner without belonging to any real user. Concrete approach (nullable `userId` vs. dedicated `platform@baburra.com` auth user) is decided in design.md after inspecting the schema.
- Add a `source` marker (`'seed' | 'user'`) on `kol_sources` and `posts` rows so seed-sourced data can be distinguished from organic user contributions for later analytics or cleanup.
- Thread `ownerUserId` and `source` overrides through `profile-scrape.service`; use the existing `selectedUrls` parameter (slice discovery results to N) to control historical depth per KOL — no new `maxPosts` parameter needed.
- Mark seed scrape jobs as `quotaExempt` so the platform user bypasses the lego credit system (same pattern used by validation scrapes today).
- Quality gate, content filter, AI sentiment extraction, and price-change hydration stay untouched — seed data must clear the same bar as user-submitted data.
- Idempotent execution: re-running the script skips KOLs/posts already in DB (by platform identifier + source URL) so partial crashes recover by simply re-running.
- Error handling: single-post failures are logged to `seed-errors.log` and skipped; a per-KOL + overall summary report is emitted to stdout on completion.

## Capabilities

### New Capabilities
- `seed-ingestion`: Pre-launch batch ingestion pipeline — config-driven seed KOL list, system-user ownership, historical-depth scrape via `selectedUrls` slicing, credit-exempt execution, idempotent re-runs, per-post error isolation, and the success criteria (≥17/19 KOLs landed, ≥600 posts passed quality gate, ≥5 tickers with ≥3 covering KOLs).

### Modified Capabilities
- `data-models`: Add `source` column on `kol_sources` and `posts` (default `'user'`), and document the platform system user row / nullable-owner rule.
- `ai-pipeline`: Document that `profile-scrape.service` exposes `ownerUserId`, `source`, and `quotaExempt` overrides and that the quality gate is applied uniformly regardless of source.

## Impact

- **New code**:
  - `scripts/seed-scrape.ts` — CLI entrypoint (drives job model: `initiateProfileScrape()` → loop `processJobBatch()`)
  - `scripts/seed-kol-config.json` — 19-KOL seed list from `baburra-seed-kol-candidates.md`
  - `scripts/lib/seed-logger.ts` — per-KOL + overall summary + error log
- **Modified code**:
  - `src/domain/services/profile-scrape.service.ts` — accept `ownerUserId`, `source`, and `quotaExempt` overrides; thread through to import pipeline
  - `src/domain/services/import-pipeline.service.ts` — thread `source` to post creation
  - `src/infrastructure/repositories/kol-source.repository.ts` / `post.repository.ts` — accept and persist `source` field
  - `supabase/migrations/<new>_add_source_and_system_user.sql` — add `source` column to `kol_sources` and `posts`, seed the platform system user row
  - `package.json` — add `seed:scrape` npm script
- **Docs**:
  - `openspec/specs/data-models/spec.md` — `source` column + platform user
  - `openspec/specs/ai-pipeline/spec.md` — note scrape-service override parameters
- **Dependencies**: no new runtime deps. Deepgram + Gemini + Tiingo keys must be present in `.env.local` when running the script. Estimated one-time cost: to be re-validated against lego credit block prices (original $51 estimate predates the credit-cost rework). AI model fallback chain (Gemma 4 → Gemini) is transparent to callers.
- **Not in scope**: cron automation, UI changes, BUG-001 fix (Podcast `detectPlatform`), BUG-004 (`APIFY_API_TOKEN` check), TikTok/Facebook seeding.

## Superseded

Tasks 4.1–4.3 of this change (the dry-run/full-run validation stage) are superseded by [`validate-podcast-pipeline-with-gooaye`](../validate-podcast-pipeline-with-gooaye/proposal.md), which narrows scope to Gooaye + a few YouTube channels and adds the observability/autoresearch work needed to certify the pipeline launch-ready. The placeholder `scripts/seed-kol-config.json` (19 KOLs with `feeds.example.com` URLs) is being removed as part of that change. The instrumentation and seed-script infrastructure built under tasks 1–3 of this change remains in use.
