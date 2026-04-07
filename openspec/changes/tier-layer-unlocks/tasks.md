## 0. Calibration

- [x] 0.1 Pulled 60-day telemetry: 16 completed scrapes, 31 transcripts (caption/gemini/deepgram), 14 YouTube posts
- [x] 0.2 Calibrated: Free 500, Pro 5000, Max 25000 monthly credits; freeL2UnlocksPerMonth=3; UNLOCK_COSTS.layer3_stock_page=100
- [x] 0.3 Audited prod: 21 profiles, all `free`, zero paying users — hard reset is safe

## 1. Database

- [x] 1.1 Create migration `supabase/migrations/031_monthly_credits_and_unlocks.sql`
- [x] 1.2 Add `content_unlocks` table with uniqueness constraint and index (per data-models spec)
- [x] 1.3 Replace `consume_credits` RPC: switch reset window from 7-day rolling to calendar-month (`date_trunc('month', now())`)
- [x] 1.4 Append `UPDATE profiles SET subscription_tier='free', credit_balance=<free monthly>, credit_reset_at=now();` to migration
- [ ] 1.5 `supabase db push --dry-run -p "$SUPABASE_DB_PASSWORD"` — review diff
- [ ] 1.6 `supabase db push -p "$SUPABASE_DB_PASSWORD"` (with user confirmation)
- [x] 1.7 Regenerate `src/infrastructure/supabase/database.types.ts` (manually added `content_unlocks` table; re-run `supabase gen types` before deploy)

## 2. Constants & Domain Models

- [x] 2.1 Rewrite `src/lib/constants/tiers.ts` with `kolTracking`, `monthlyCredits`, `freeL2UnlocksPerMonth`
- [x] 2.2 Update `src/domain/models/user.ts`: add `MONTHLY_CREDIT_LIMITS`, add `UNLOCK_COSTS`, remove `AI_QUOTA` alias (kept `CREDIT_LIMITS` as alias to minimise blast radius)
- [x] 2.3 Fix all call sites referencing old names — type-check clean

## 3. Repository & Service

- [x] 3.1 Create `src/infrastructure/repositories/unlock.repository.ts`
- [x] 3.2 Create `src/domain/services/unlock.service.ts` with `unlockLayer2`, `unlockLayer3`, `hasUnlockedLayer2`, `hasUnlockedLayer3`, `getFreeL2UnlocksUsedThisMonth`, `listUserUnlocks`
- [x] 3.3 Define `UpgradeRequiredError` and `InsufficientCreditsError` with structured `reason` field
- [x] 3.4 Wire `consume_credits` RPC call into `unlockLayer3` for Pro path with check-first idempotency

## 4. API Routes

- [x] 4.1 Create `src/app/api/unlocks/layer2/route.ts` (POST)
- [x] 4.2 Create `src/app/api/unlocks/layer3/route.ts` (POST)
- [x] 4.3 Create `src/app/api/unlocks/route.ts` (GET list)
- [x] 4.4 Map domain errors to HTTP 402 with structured error body
- [x] 4.5 Add auth check using existing `getCurrentUserId()` helper

## 5. Feature-Gate Rewrite

- [x] 5.1 Rewrite `src/domain/services/feature-gate.service.ts` — `Layer` type + legacy name → layer mapping for minimal blast radius
- [x] 5.2 Legacy feature names kept as aliases mapping to layers; no caller changes required
- [x] 5.3 `src/hooks/use-feature-gate.ts` extended with `layer` field

## 6. Client Hooks & Components

- [x] 6.1 Create `src/hooks/use-unlocks.ts` with `unlockKeys`, `useUserUnlocks()`, `useUnlockChecks()`, `useUnlockLayer2Mutation()`, `useUnlockLayer3Mutation()`
- [x] 6.2 Create `src/components/paywall/unlock-cta.tsx` with 3 variants
- [x] 6.3 `BlurGate` reused via the legacy `argument_cards` / `win_rate_breakdown` feature names (they now map to layer2)

## 7. KOL Page Wiring

- [x] 7.1 `useUnlockChecks()` wired in `KolStockSection` (checks fetched once via React Query)
- [x] 7.2 Free users see compact preview + `<UnlockCta variant="layer2">`
- [x] 7.3 Pro/Max users bypass via `hasLayer2` returning true

## 8. Stock Page Wiring

- [x] 8.1 `useUnlockChecks().hasLayer3(stock.id)` wired in `src/app/(app)/stocks/[ticker]/page.tsx`
- [x] 8.2 Free: locked CTA (`layer3_locked`)
- [x] 8.3 Pro: credit-gated CTA (`layer3_credit_gated`)
- [x] 8.4 Max: always full page

## 9. Tests

- [x] 9.1 `src/domain/services/__tests__/unlock.service.test.ts` — 10 tests, all passing (Free quota, Pro credits, Max bypass, idempotency, error paths)
- [x] 9.2 `feature-gate.service.test.ts` rewritten for L1/L2/L3 shape — 13 tests passing
- [ ] 9.3 E2E: Free user uses 3 L2 unlocks then hits paywall on 4th — DEFERRED (needs seeded users + running preview)
- [ ] 9.4 E2E: Free user on Stock page sees locked preview — DEFERRED
- [ ] 9.5 E2E: Pro user unlocks Stock page, credits deducted, reload persists unlock — DEFERRED
- [x] 9.6 `npm run type-check && npm run lint && npm test` — all green (719 tests passing, 0 lint errors)

## 10. Docs & Specs

- [x] 10.1 `openspec/specs/data-models/spec.md` — added `content_unlocks` to core tables
- [x] 10.2 `openspec/specs/api-contracts/spec.md` — added `/api/unlocks/*` endpoints
- [ ] 10.3 Update `docs/DOMAIN_MODELS.md` with the `ContentUnlock` type — DEFERRED
- [ ] 10.4 Update `docs/API_SPEC.md` with unlock route request/response shapes — DEFERRED

## 11. Verification & Archive

- [x] 11.1 Local verification: type-check clean, 719/719 unit tests passing, lint 0 errors
- [ ] 11.2 Open PR against `main` — DEFERRED (requires user confirmation per session scope)
- [ ] 11.3 After merge, run `/opsx:archive tier-layer-unlocks`
