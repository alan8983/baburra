## 1. Schema + Platform User

- [x] 1.1 Create migration `supabase/migrations/20260412000000_add_source_and_platform_user.sql` adding `source TEXT` column + CHECK constraint to `kol_sources` and `posts`
- [x] 1.2 In the same migration insert the `platform@baburra.com` auth user idempotently and capture the resulting UUID
- [x] 1.3 Add `PLATFORM_USER_ID` constant in `src/lib/constants/config.ts` referencing that UUID
- [x] 1.4 Applied migration via Supabase MCP (apply_migration)
- [x] 1.5 Regenerated `src/infrastructure/supabase/database.types.ts` via Supabase MCP (generate_typescript_types)
- [x] 1.6 `npm run type-check` passes

## 2. Service Overrides

- [x] 2.1 Define a `ScrapeOverrides` interface (`{ ownerUserId?, source?, quotaExempt? }`) in `src/domain/models/kol-source.ts` and thread it through `initiateProfileScrape()` → `processJobBatch()` in `profile-scrape.service.ts`
- [x] 2.2 Extend `kol-source.repository.ts` `findOrCreateSource()` to accept and persist optional `source`; add `findSourceByPlatformId()` helper for idempotency
- [x] 2.3 `quotaExempt` override wired through `processJobBatch()` → `processUrl()` (4th arg); also prevents `markFirstImportUsed()` from firing
- [x] 2.4 `ownerUserId` override wired to `createKolWithValidation()` `validatedBy` param
- [x] 2.5 Add 4 unit tests in `profile-scrape.service.test.ts` covering: source override to findOrCreateSource, ownerUserId to createKolWithValidation, quotaExempt skips credits, quotaExempt prevents markFirstImportUsed — all 35 tests pass
- [x] 2.6 Verify API routes compile and behave identically — `npm run type-check` passes, all overrides default to `undefined`

## 3. Seed Config + Script

- [x] 3.1 Create `scripts/seed-kol-config.json` with 19 placeholder entries (platform, identifier, displayName, maxPosts, priority) — actual identifiers to be filled from `baburra-seed-kol-candidates.md`
- [x] 3.2 Create `scripts/seed-scrape.ts` wiring up: config load → idempotency check → per-KOL loop → `initiateProfileScrape()` with `selectedUrls` sliced to `config.maxPosts` and overrides `{ ownerUserId: PLATFORM_USER_ID, source: 'seed', quotaExempt: true }` → loop `processJobBatch(jobId)` until job status is `'completed'`
- [x] 3.3 Add idempotency: skip KOLs whose `kol_sources.(platform, platform_id)` already has `source='seed'` via `findSourceByPlatformId()` + check
- [x] 3.4 Add per-KOL error logging via JSONL to `scripts/logs/seed-errors-<timestamp>.jsonl`
- [x] 3.5 Add per-KOL + final summary printer reading from scrape job counters
- [x] 3.6 Add high-error-rate warning (>50% on a KOL prints a stdout warning)
- [x] 3.7 Support `--dry-run` flag that runs discovery but skips job creation and DB writes
- [x] 3.8 Add `"seed:scrape": "npx tsx scripts/seed-scrape.ts"` to `package.json`

## 4. Validation + Docs

- [ ] 4.1 Run `npm run seed:scrape -- --dry-run` against local/staging Supabase and attach summary to the PR
- [ ] 4.2 Run full seed against staging; spot-check 10% of passed posts for AI extraction quality
- [ ] 4.3 Verify ≥17/19 KOLs seeded, ≥600 posts imported, ≥55% quality-gate pass rate, ≥5 tickers with ��3 KOL coverage
- [x] 4.4 Commit `scripts/seed-rollback.sql` deleting rows WHERE `source='seed'` (scoped to `kol_sources`, `posts`, `post_arguments`, `post_stocks`, `scrape_jobs`, orphaned `kols`)
- [ ] 4.5 Update `openspec/specs/data-models/spec.md` and `openspec/specs/ai-pipeline/spec.md` via `/opsx:archive`
- [ ] 4.6 Update `docs/WEB_DEV_PLAN.md` if this unlocks a phase milestone
