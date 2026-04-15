## Why

PRs #74 (persist-win-rate-samples) and #75 (persist-kol-scorecard-cache) built a three-layer cache pipeline (L1 `volatility_thresholds` → L2 `post_win_rate_samples` → L3 `kol_scorecard_cache` / `stock_scorecard_cache`) and deployed all the code to production. Today in prod the KOL detail page still shows "—" for SQR and Return — the features built in #74/#75 are **effectively dark**.

Root cause: two feature flags (`USE_SCORECARD_CACHE`, `USE_WIN_RATE_SAMPLE_CACHE`) default OFF in production (`src/lib/feature-flags.ts:28-29` and `:43-44`), and neither has been set in Vercel's environment variables. With both flags off, the win-rate route falls back to `legacyCompute()` — an inline pipeline that fetches Tiingo candles for every stock the KOL has posted about, synchronously. Today's runtime logs confirm the consequence: `GET /api/kols/b7a958c4.../win-rate` is returning **504 Gateway Timeout** (Vercel Hobby's 10 s function limit) on Gooaye because the cold compute can't finish in time.

Meanwhile, the L3 scorecard cache tables are almost empty: `kol_scorecard_cache` has **1 of 9** KOLs warm (Gooaye, from PR #76's one-off backfill script) and `stock_scorecard_cache` has **0 of 194** stocks. Even after the flag is flipped, cold-KOL requests will hit `{ status: 'computing' }` and rely on a fire-and-forget background compute (`void computeKolScorecard(kolId)`) that is unreliable on Vercel serverless — the sandbox is suspended the moment the response is sent, so the upsert never lands. Users on any KOL other than Gooaye would poll `computing` forever.

This change is the missing deploy-side work: flip the flags, pre-warm the caches for every KOL and stock, harden the fire-and-forget path so cold KOLs self-heal, and verify.

## What Changes

### Deployment / ops (user actions in Vercel dashboard)
- Set `USE_SCORECARD_CACHE=true` in Vercel production environment.
- Set `USE_WIN_RATE_SAMPLE_CACHE=true` in Vercel production environment.
- Redeploy so the build binds the new env values (Vercel env vars only apply to new builds).

### Backfill
- Extend `scripts/backfill-gooaye-scorecards.ts` (added in PR #76) to loop over **every** KOL with posts and **every** stock with posts, not just Gooaye. Accept `--kol <slug|id>`, `--stocks`, and `--all` flags.
- Run the extended script against production to pre-warm:
  - `kol_scorecard_cache`: 9 rows (one per KOL with posts).
  - `stock_scorecard_cache`: 194 rows (one per stock with at least one post).

### Resilience
- Harden the fire-and-forget compute enqueue in `src/domain/services/scorecard.service.ts` so background recomputes survive Vercel serverless freeze. Options explored in `design.md`; decision is to use `waitUntil()` from `next/server` when available and fall back to an inline `await` with a short timeout when it isn't. This removes the "cold KOL polls `computing` forever" failure mode.

### Verification
- Manual: `/api/kols/<gooaye-id>/win-rate` returns `{ status: 'ready', day30: { sqr, avgReturn, hitRate, ... }, ... }` on a warm cache and renders correctly on the KOL detail page for every KOL.
- Automated: Browser MCP E2E (`validation.md`) navigates to three different KOL detail pages and asserts the scorecard ring paints within 3 s with non-dash values.

### Cleanup (staged, out of this change's scope but tracked)
- PR #74 tasks §10.5 and PR #75 tasks §10.3 both call for deleting the feature flag and the legacy compute path **after** 48 h of successful operation. Those deletions stay deferred — this change only gets the cache path live.

## Capabilities

### Modified Capabilities
- `kol-scorecard`: rollout from dark-launched to live. No contract change; execution environment changes from "flag-gated off" to "flag-gated on with warm cache".
- `stock-scorecard`: same.

### New Capabilities
- None. This change is pure rollout.

## Impact

- **Vercel:** 2 new env vars in production. One redeploy required.
- **Supabase prod:** ~200 upserts total (9 KOL rows + ~194 stock rows). Each compute involves a few hundred ms of candle + sample reads. Run during off-peak window; expected run time ~5–10 min sequentially, ~1 min in parallel.
- **Code:** one file touched (`src/domain/services/scorecard.service.ts`) for the `waitUntil`-based enqueue. One script extended (`scripts/backfill-gooaye-scorecards.ts` → `scripts/backfill-scorecards.ts`, or a new script that supersedes it).
- **DB schema:** unchanged.
- **API surface:** unchanged (the discriminated-union response already ships from PR #75).
- **User-visible:** KOL detail pages stop showing "—" for SQR and Return on the 8 KOLs that are currently dark; p95 latency drops from 10 s (504) to sub-100 ms on warm hits.
