## Tasks

### 1. Parallelize stock-price fetching in KOL win-rate route
- [x] 1.1 In `src/app/api/kols/[id]/win-rate/route.ts`, replace the sequential `for…of getStockPrices` loop with `Promise.allSettled` + 5 s per-stock timeout, matching the pattern in `src/lib/api/enrich-price-changes.ts`

### 2. Seed `^TWII` index ticker
- [x] 2.1 Create migration `supabase/migrations/20260414000001_seed_twii_index.sql` that inserts a `stocks` row for `^TWII` with `name = 'TWSE Weighted Index'`, `market = 'TW'`; use `ON CONFLICT DO NOTHING` for idempotency
- [x] 2.2 Applied directly to remote DB via `execute_sql`

### 3. Harden profile repository
- [x] 3.1 In `src/infrastructure/repositories/profile.repository.ts` `getProfile`, catch errors from the select query that indicate a missing column; on such errors, retry with a reduced column list omitting `default_win_rate_period` and return `DEFAULT_WIN_RATE_PERIOD` for that field

### 4. Verify
- [x] 4.1 Run `npm run type-check` — pass (only pre-existing yt-dlp-exec error)
- [x] 4.2 Run `npx vitest run src/domain/calculators/win-rate.calculator.test.ts` — 31 tests pass
- [x] 4.3 Run `npx vitest run src/domain/services/win-rate.service.test.ts` — 6 tests pass
- [x] 4.4 Run full `npm test` — 811 pass, 4 pre-existing failures (yt-dlp-exec), 0 regressions
