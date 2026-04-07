## Context

Baburra's existing paywall (migrations 022, 029; archived change `2026-04-06-feature-tier-paywall`) uses weekly credit resets, per-AI-operation credit costs (text_analysis=1, video_transcription_per_min=5, etc.), and a feature-flag enum for UI gating. Product direction has shifted: the shared KOL data pool should be the hook, with gating on **depth of insight** (Layer 2: single KOL × ticker; Layer 3: cross-KOL stock page), not on data visibility.

Source doc `baburra-tier-design.md` proposed a monthly 5/50/unlimited wallet with flat scrape costs. Those numbers don't survive unit-economic scrutiny (Free cliffs out in one session; flat scrape cost misprices video KOLs by ~20×). This design reinterprets the doc's philosophy while reusing the existing well-tested credit-accounting machinery.

Stakeholders: product (gating shape), growth (free→paid funnel), infra (scrape cost economics).

## Goals / Non-Goals

**Goals:**
- Layer 1 remains fully free — no regression to aggregated KOL intel.
- Free users get a real taste of Layer 2 (N unlocks/month, persistent) before hitting a paywall.
- Layer 3 drives Pro→Max upsell: Pro pays credits per ticker, Max is unlimited.
- Persistent per-user unlocks — never re-charge for content the user has already paid for.
- Reuse existing `consume_credits` / `refund_credits` RPCs and per-op `CREDIT_COSTS`.
- Single source of truth for tier limits (`src/lib/constants/tiers.ts`).
- Clean migration: hard reset all balances, no grandfathering.

**Non-Goals:**
- Stripe integration / payment rails (admin-only tier changes for MVP).
- Seed scraping pipeline (bi-weekly 30-KOL pool).
- API access, CSV/full export, priority scrape queue.
- Credit-pack à la carte purchases.
- Cross-KOL comparison matrix UI (Max-tier feature, deferred).
- Portfolio simulation.
- Rewriting the scraping flow or AI-op cost model.

## Decisions

### D1. One wallet, monthly reset

**Chosen:** Keep `profiles.credit_balance` / `credit_reset_at` columns; update `consume_credits` RPC so reset window is one calendar month instead of 7 days. Credits pay for (a) AI ops during scraping (unchanged per-op costs) and (b) Layer 3 unlocks on Pro tier.

**Alternative considered:** Separate "unlock credits" wallet layered on top of existing weekly AI credits. Rejected — two wallets means two UIs, two reset cycles, two mental models for users, and double the bugs. The single-wallet model keeps Pro users honest: heavy L3 unlocking eats into their scrape budget, which is the natural mechanism that pushes power users to Max.

### D2. Layer 2 is free-quota-gated, not credit-gated

**Chosen:** Free users get `freeL2UnlocksPerMonth` (placeholder: 3) persistent unlocks; after that, upgrade prompt. Pro/Max: unlimited, no unlock row written.

**Alternative considered:** Charge 1 credit per L2 unlock for Free (doc's proposal). Rejected — at 300 monthly credits a Free user can't scrape *and* unlock; the paywall becomes a wall, not a ramp. The free-quota approach also makes L2 conversion psychologically cleaner ("I ran out of free unlocks" > "I ran out of credits").

### D3. `content_unlocks` table shape

**Chosen:** Single table with `unlock_type` enum + `target_key` text column, unique on `(user_id, unlock_type, target_key)`. For `kol_ticker`, `target_key = "{kol_id}:{stock_id}"`. For `stock_page`, `target_key = "{stock_id}"`.

**Alternative considered:** Polymorphic FKs (nullable `kol_id`, `stock_id` columns per row type) or two separate tables. Rejected — string key is simpler, index-friendly, and the app layer already owns the key format. Two tables would double the repository surface for no real benefit.

### D4. Idempotent unlocks

Unlock endpoints MUST be idempotent. If a user re-clicks "Unlock" on already-unlocked content, the service checks `content_unlocks` first and returns success without re-charging. No unique-constraint violations should ever reach the client.

### D5. Tier check is server-side only

All unlock decisions happen in `UnlockService` running in API routes with `createAdminClient()`. The client hook optimistically updates but trusts the server response. Never trust client-reported tier.

### D6. Free L2 quota is derived, not denormalized

Monthly L2 quota usage = `count(content_unlocks where user_id=? and unlock_type='kol_ticker' and unlocked_at >= date_trunc('month', now()))`. No counter column — avoids drift, avoids reset-window bugs.

### D7. Feature-gate service keeps its render-type vocabulary

`blur_gate` / `pro_badge` / `locked` render modes survive; only the feature list changes. UI components (`BlurGate`, etc.) stay. This minimizes UI churn.

## Risks / Trade-offs

- **[R1] Hard reset angers existing paying users** → Mitigation: this is MVP pre-launch; audit `profiles` for any non-free users before migration and notify manually. If any exist in prod, escalate before running migration.
- **[R2] Placeholder credit numbers ship uncalibrated** → Mitigation: first task in tasks.md is telemetry calibration; numbers in constants are marked `// PLACEHOLDER` and tasks.md gates deploy on calibration.
- **[R3] Free quota exhaustion happens silently** → Mitigation: `UnlockService.unlockLayer2` returns structured `UpgradeRequiredError` with `reason: 'quota_exhausted' | 'tier_locked'` so the client can show the right CTA.
- **[R4] Race condition on concurrent unlocks draining credits past zero** → Mitigation: rely on `consume_credits` RPC's atomic SQL semantics (existing in migration 029); do not duplicate the check in app code.
- **[R5] Stale unlock cache on client** → Mitigation: React Query invalidates `unlockKeys.all` on every successful unlock mutation.
- **[R6] KOL page has N stocks — N unlock checks per render** → Mitigation: fetch all unlocks for user once at page load (single query), pass as Set to child components.

## Migration Plan

1. Merge proposal and design; run `/opsx:apply` per tasks.md.
2. Create migration `031_monthly_credits_and_unlocks.sql` and run `supabase db push --dry-run` to preview.
3. Audit prod: `select id, subscription_tier, credit_balance from profiles where subscription_tier != 'free';` — if any rows, stop and escalate.
4. `supabase db push` (with user confirmation) → applies table, RPC update, and `UPDATE profiles SET ...` reset.
5. Regenerate types, `npm run type-check`, `npm test`, `npm run test:e2e`.
6. Deploy.

**Rollback:** Down migration drops `content_unlocks`, reverts `consume_credits` RPC to the migration-029 version, and leaves profiles as-is (credit_balance after reset is fine; reapplying old weekly semantics just means the next reset is early).

## Open Questions

- Final values for `monthlyCredits` (300/3000/15000?) and `UNLOCK_COSTS.layer3_stock_page` (100?). Needs scrape-cost telemetry. Gate: tasks.md task 0.
- Should `freeL2UnlocksPerMonth` be 3 or 5? Gut says 3 — low enough to create urgency, high enough to feel real.
- Do we refund L3 unlock credits if the user downgrades? Default: no — unlocks are permanent regardless of tier transitions.
