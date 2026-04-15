## Tasks

### 1. Harden the fire-and-forget enqueue (code delta)

- [x] 1.1 In `src/domain/services/scorecard.service.ts`, wrap `enqueueKolScorecardCompute` so it uses `@vercel/functions`'s `waitUntil` when available, falling back to `void` for dev / non-Vercel runtimes. See design §D3 for the exact shape (dynamic `require` wrapped in try/catch to avoid build-time failure if the module isn't resolvable).
- [x] 1.2 Apply the same pattern to `enqueueStockScorecardCompute`.
- [x] 1.3 Add a one-line comment above each enqueue function explaining why `waitUntil` is needed (Vercel sandbox freezes on response; without it, background computes never land).
- [x] 1.4 `npm run type-check` — pass.
- [x] 1.5 `npm run lint` — pass.
- [x] 1.6 `npm test` — no regressions (no new tests required; existing scorecard tests mock the enqueue path).

### 2. Extend the backfill script for all KOLs and stocks

- [x] 2.1 Rename or supersede `scripts/backfill-gooaye-scorecards.ts` → `scripts/backfill-scorecards.ts`. Keep the old filename as a thin re-export if the CHANGELOG / docs reference it.
- [x] 2.2 Add argument parsing:
  - `--kol <slug|id|all>` (default: require explicit value, reject empty). `all` means every KOL with ≥ 1 post.
  - `--stocks` flag (default: off). When on, also backfill `stock_scorecard_cache` for every stock referenced by the selected KOL(s).
  - `--dry-run` flag (default: off). Already present from PR #76.
- [x] 2.3 For `--kol all`: query `SELECT DISTINCT kol_id FROM posts` via `createAdminClient()`, iterate sequentially (not in parallel — Tiingo rate limits).
- [x] 2.4 For `--stocks`: collect the union of stock_ids referenced by the selected KOL(s) via `SELECT DISTINCT stock_id FROM post_stocks WHERE post_id IN (SELECT id FROM posts WHERE kol_id IN (...))`. Iterate sequentially.
- [x] 2.5 Per-KOL and per-stock: log `[backfill] kol=<slug> computed in <ms>ms (posts=<n>, stocks=<n>)` so runtime visibility during a long batch is clear.
- [x] 2.6 Progress summary at the end: `Completed: <n>/<n> KOLs in <total>s; <n>/<n> stocks in <total>s. <n> failures (<ids>)`.
- [x] 2.7 Update `scripts/README.md` with the new flags and a production usage example.
- [x] 2.8 Dry-run locally first: `npx tsx scripts/backfill-scorecards.ts --kol all --stocks --dry-run` and inspect the planned work.

### 3. Pre-production verification (local)

- [ ] 3.1 Run the backfill against dev / staging DB first if available. Confirm no script errors.
- [ ] 3.2 If only prod DB is accessible: run `--dry-run` first, review output, then proceed to §4.

### 4. Deploy the code delta

- [ ] 4.1 Create a PR with the §1 changes + §2 script extension.
- [ ] 4.2 Ensure CI passes (type-check, lint, tests, build).
- [ ] 4.3 Merge to `main` → Vercel auto-deploys.
- [ ] 4.4 Confirm the new deployment is `READY` in Vercel dashboard before proceeding.

### 5. Run the backfill against production (flags still OFF)

**Pre-rollout baseline captured 2026-04-15 via readonly MCP tools (not an action, just measurement):**
- Supabase: `warm_kols = 1/9`, `warm_stocks = 0/194` — cache is effectively empty as predicted.
- Vercel runtime logs: `0` entries matching `win-rate` in the past 24 h (no traffic hit the endpoint during the window — consistent with low dev activity; does not contradict the "4 Gooaye 504s today" observed earlier in the day).
- Actionable state: backfill + flag flip still pending; this baseline confirms the rollout has not yet occurred.

- [ ] 5.1 Set local env:
  ```bash
  export SUPABASE_SERVICE_ROLE_KEY=<prod service role key>
  export NEXT_PUBLIC_SUPABASE_URL=<prod supabase url>
  export TIINGO_API_TOKEN=<prod Tiingo token>
  ```
- [ ] 5.2 Run with `--dry-run` to preview:
  ```bash
  npx tsx scripts/backfill-scorecards.ts --kol all --stocks --dry-run
  ```
  Verify the expected counts (9 KOLs, ~194 stocks).
- [ ] 5.3 Run live:
  ```bash
  npx tsx scripts/backfill-scorecards.ts --kol all --stocks
  ```
  Expected duration: 5–10 min. Watch for any non-retryable errors.
- [ ] 5.4 Verify row counts via Supabase MCP `execute_sql`:
  ```sql
  SELECT
    (SELECT COUNT(*) FROM kol_scorecard_cache WHERE classifier_version = 1 AND stale = FALSE) AS warm_kols,
    (SELECT COUNT(DISTINCT kol_id) FROM posts) AS expected_kols,
    (SELECT COUNT(*) FROM stock_scorecard_cache WHERE classifier_version = 1 AND stale = FALSE) AS warm_stocks,
    (SELECT COUNT(DISTINCT stock_id) FROM post_stocks) AS expected_stocks;
  ```
  Pass criteria: warm ≥ expected for both. (Allow ≥ not = because a KOL with only `excluded` samples may legitimately produce no row.)

### 6. Flip the feature flags in Vercel

- [ ] 6.1 Vercel Dashboard → `baburra` project → Settings → Environment Variables.
- [ ] 6.2 Add `USE_SCORECARD_CACHE` with value `true`, scoped to **Production** only.
- [ ] 6.3 Add `USE_WIN_RATE_SAMPLE_CACHE` with value `true`, scoped to **Production** only.
- [ ] 6.4 Save.
- [ ] 6.5 Vercel Dashboard → Deployments → latest → ⋯ menu → Redeploy → confirm (env var changes only bind on new builds).
- [ ] 6.6 Wait for new deployment to reach `READY` state.

### 7. Verify end-to-end in production

- [ ] 7.1 SQL spot-check that the 504s have stopped: query Vercel runtime logs for `/api/kols/*/win-rate` over the past 15 min post-redeploy. Expect zero 504s, all 200s.
- [ ] 7.2 Browser MCP validation per `validation.md` Tier 2.
- [ ] 7.3 Manually navigate to 3 KOL detail pages in a browser (Gooaye, plus 2 others). Confirm the scorecard ring paints with a numeric hit rate within 3 s. Screenshot.
- [ ] 7.4 Check `/api/dashboard` via a home-page load — this route also uses the sample cache; confirm no regression.

### 8. Soak + document follow-ups

- [ ] 8.1 Leave the flags on for 48 h. Monitor Vercel runtime logs for any 504s or error spikes on the win-rate or scorecard endpoints.
- [ ] 8.2 After 48 h of clean operation, mark PR #74 task §10.4 and PR #75 task §10.1 as done in their respective `tasks.md`.
- [ ] 8.3 Open (but do NOT implement) follow-up items:
  - PR #74 §10.5: "Remove flag + legacy stateless path" in `/api/kols/[id]/win-rate/route.ts`, `/api/stocks/[ticker]/win-rate/route.ts`, `/api/dashboard/route.ts`.
  - PR #75 §10.3: "Delete the fallback path, remove the flag" — same scope as #74 §10.5 applied to scorecard.
  - Consider wiring scorecard compute into the new-KOL-creation pipeline so newly imported KOLs are warm before their first view.

### 9. Archive + docs

- [ ] 9.1 Run `/opsx:archive rollout-scorecard-cache-prod` once §§1–7 are complete and §8 soak is underway (don't wait 48 h to archive; archive documents the rollout decision, not the cleanup).
- [ ] 9.2 No `docs/WEB_DEV_PLAN.md` phase change.
- [ ] 9.3 No `openspec/specs/` update — the living spec for `kol-scorecard` and `stock-scorecard` was finalized on PR #75 archive; this change doesn't modify the contract.
