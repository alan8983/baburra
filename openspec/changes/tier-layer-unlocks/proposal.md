## Why

Current paywall gates on KOL-tracking count and a grab-bag of feature flags, which fights the product's core value prop: the shared data pool is the hook. We need to re-gate on **usage depth** (Layer 1 open, Layer 2 semi-gated, Layer 3 gated) so Free users see the "wow moment" immediately and convert via depth-of-insight — not via data withholding. This replaces the archived `2026-04-06-feature-tier-paywall` model with a layer-based, persistent-unlock model.

## What Changes

- **BREAKING**: Replace weekly credit resets with **monthly** resets in the `consume_credits` RPC.
- **BREAKING**: Retire the current `Feature` enum (`argument_cards`, `win_rate_breakdown`, `kol_comparison`, `argument_timeline`, `csv_export`, `api_access`, `portfolio_simulation`) and rewrite `feature-gate.service.ts` around Layer 1 / Layer 2 / Layer 3.
- **BREAKING**: Reset all existing profiles to `free` tier and the new monthly credit allotment on migration.
- New `content_unlocks` table for persistent per-user L2/L3 unlocks.
- New `UnlockService`, `UnlockRepository`, and React Query hooks (`use-unlocks`).
- New API routes: `POST /api/unlocks/layer2`, `POST /api/unlocks/layer3`, `GET /api/unlocks`.
- `TIER_LIMITS` gains `monthlyCredits` and `freeL2UnlocksPerMonth`; `CREDIT_LIMITS` / `AI_QUOTA` aliases removed.
- `UNLOCK_COSTS.layer3_stock_page` constant (placeholder, to be calibrated).
- KOL page (`/kols/[id]`) and Stock page (`/stocks/[ticker]`) wired to unlock state + CTAs.
- Out of scope (future changes): Stripe, credit packs, seed scrape pipeline, API access, exports, priority queue, cross-KOL comparison UI.

## Capabilities

### New Capabilities
- `tier-unlocks`: Layer-based persistent content-unlock model — tier definitions, credit wallet semantics, unlock rules for L2 (free quota) and L3 (credit-gated on Pro, free on Max), and the `content_unlocks` persistence contract.

### Modified Capabilities
- `data-models`: Adds `content_unlocks` table; changes `profiles.credit_reset_at` semantics from weekly to monthly.
- `api-contracts`: Adds `/api/unlocks/layer2`, `/api/unlocks/layer3`, `/api/unlocks` endpoints.

## Impact

- **Code**: `src/domain/services/feature-gate.service.ts` (rewrite), `src/domain/services/unlock.service.ts` (new), `src/infrastructure/repositories/unlock.repository.ts` (new), `src/lib/constants/tiers.ts`, `src/domain/models/user.ts`, `src/app/api/unlocks/**` (new), `src/app/(app)/kols/[id]/page.tsx`, `src/app/(app)/stocks/[ticker]/page.tsx`, `src/hooks/use-unlocks.ts` (new), `src/components/paywall/unlock-cta.tsx` (new).
- **DB**: new migration `031_monthly_credits_and_unlocks.sql` — creates table, updates `consume_credits` RPC, resets all profiles.
- **Types**: regenerate `src/infrastructure/supabase/database.types.ts`.
- **Docs/specs**: update `openspec/specs/data-models/spec.md` and `openspec/specs/api-contracts/spec.md`.
- **Dependencies**: none.
- **User-visible**: all existing users reset to Free on deploy; credit balances and unlock history wiped.
