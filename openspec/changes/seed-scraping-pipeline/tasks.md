## 1. Schema + Platform User

- [ ] 1.1 Create migration `supabase/migrations/<ts>_add_source_and_platform_user.sql` adding `source TEXT` column + CHECK constraint to `profile_scrapes` and `posts`
- [ ] 1.2 In the same migration (or a sibling data migration) insert the `platform@baburra.com` auth user idempotently and capture the resulting UUID
- [ ] 1.3 Add `PLATFORM_USER_ID` constant in `src/lib/constants/` (or similar) referencing that UUID
- [ ] 1.4 Run `supabase db push --dry-run` and confirm the diff matches expectations
- [ ] 1.5 Apply migration and regenerate `src/infrastructure/supabase/database.types.ts` via `supabase gen types`
- [ ] 1.6 `npm run type-check` passes

## 2. Repository + Service Overrides

- [ ] 2.1 Extend `profile.repository.ts` / `post.repository.ts` insert helpers to accept and persist `source`
- [ ] 2.2 Thread `source` through `import-pipeline.service.ts` so quality-gated posts inherit the value
- [ ] 2.3 Add optional `{ maxPosts, ownerUserId, source }` overrides to the public entry points of `profile-scrape.service.ts`
- [ ] 2.4 Add unit tests in `src/domain/services/__tests__/profile-scrape.service.test.ts` covering: default call unchanged, overrides applied, quality gate still enforced
- [ ] 2.5 Verify API routes under `src/app/api/scrape/` compile and behave identically (no signature changes required)

## 3. Seed Config + Script

- [ ] 3.1 Create `scripts/seed-kol-config.json` with 19 entries mapped from `baburra-seed-kol-candidates.md` (platform, identifier, displayName, maxPosts, priority)
- [ ] 3.2 Create `scripts/seed-scrape.ts` wiring up: config load → platform user lookup → per-KOL loop → profile-scrape.service call with overrides
- [ ] 3.3 Add idempotency: skip KOLs whose `(platform, platform_id)` already has `source='seed'`; rely on existing `findPostBySourceUrl` dedupe for posts
- [ ] 3.4 Add per-post try/catch writing structured JSONL to `scripts/logs/seed-errors-<timestamp>.jsonl`
- [ ] 3.5 Add per-KOL + final summary printer (total, imported, duplicates, filtered, errors, tickers)
- [ ] 3.6 Add high-error-rate warning (>50% on a KOL prints a stdout warning)
- [ ] 3.7 Support `--dry-run` flag that runs discovery but skips DB writes
- [ ] 3.8 Add `"seed:scrape": "tsx scripts/seed-scrape.ts"` (or existing runner convention) to `package.json`

## 4. Validation + Docs

- [ ] 4.1 Run `npm run seed:scrape -- --dry-run` against local/staging Supabase and attach summary to the PR
- [ ] 4.2 Run full seed against staging; spot-check 10% of passed posts for AI extraction quality
- [ ] 4.3 Verify ≥17/19 KOLs seeded, ≥600 posts imported, ≥55% quality-gate pass rate, ≥5 tickers with ≥3 KOL coverage
- [ ] 4.4 Commit `scripts/seed-rollback.sql` deleting rows WHERE `source='seed'` (scoped to `kols`, `profile_scrapes`, `posts`, `arguments`)
- [ ] 4.5 Update `openspec/specs/data-models/spec.md` and `openspec/specs/ai-pipeline/spec.md` via `/opsx:archive`
- [ ] 4.6 Update `docs/WEB_DEV_PLAN.md` if this unlocks a phase milestone
