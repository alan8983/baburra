## Context

Baburra currently has a two-tier system (`free`/`paid`) defined in migration 022, with a newer three-tier credit system (`free`/`pro`/`max`) added in migration 029. The codebase still references the old two-tier model in `SUBSCRIPTION_LIMITS` (`config.ts`) and `getUserTier()` (profile repository). KOL subscription limits are enforced server-side at 10/50 (free/paid). There is no feature gating — all UI features are accessible to all users.

The credit system migration 029 already introduced `profiles.subscription_tier` with `free`/`pro`/`max` values, `credit_balance`, and `credit_reset_at`. The old `profiles.tier` column (free/paid) is redundant.

Existing infrastructure: next-intl for i18n (zh-TW + en), shadcn/ui components (Dialog, Button, Badge), React Query hooks for data fetching, Zustand for UI state.

## Goals / Non-Goals

**Goals:**
- Centralised feature gate system that all components use (no scattered tier checks)
- Three soft paywall patterns: blur gate, pro badge, tracking limit intercept
- Server + client enforcement of KOL tracking limits per tier
- Reconcile old two-tier constants with three-tier credit system
- i18n support for all paywall text

**Non-Goals:**
- Payment/Stripe integration (pricing page is static placeholder for now)
- Building the gated features themselves (KOL comparison, argument timeline, CSV export) — only the gates
- Analytics/conversion tracking infrastructure
- A/B testing paywall variants
- API access or portfolio simulation (Max-tier features are future)

## Decisions

### D1: Centralised feature gate service over per-component checks

**Decision:** Create `src/domain/services/feature-gate.service.ts` with a `getFeatureAccess(feature, userTier)` function that returns gate type + metadata. Components consume via `useFeatureGate` hook.

**Rationale:** Scattering `if (tier === 'free')` across components creates maintenance burden and inconsistency. A single service makes tier logic testable, auditable, and easy to update when tiers change.

**Alternative considered:** React context provider wrapping the entire app with all gate states pre-computed. Rejected because it would re-render on any tier change and most components only need one feature's gate state.

### D2: Feature gate as pure function, hook reads tier from existing profile

**Decision:** The gate service is a pure function (no React dependency). The `useFeatureGate` hook calls it with the user's tier from the existing profile/credit query.

**Rationale:** Keeps the domain logic testable without React. The hook is a thin adapter.

### D3: Tier constants in dedicated file replacing old config

**Decision:** Create `src/lib/constants/tiers.ts` with `TIER_LIMITS` constant (three tiers with `kolTracking` and `weeklyCredits`). Remove `SUBSCRIPTION_LIMITS` from `config.ts`. Update subscription API and hook to use new constants.

**Rationale:** Single source of truth. The old `SUBSCRIPTION_LIMITS` object with `free`/`paid` keys conflicts with the three-tier model.

### D4: Blur gate as wrapper component with CSS-only blur

**Decision:** `BlurGate` wraps children, renders first N normally, applies `filter: blur(4px)` + gradient overlay via CSS on the rest. Pure CSS approach, no canvas or image manipulation.

**Rationale:** CSS blur is performant, works on any content type, and degrades gracefully. The gradient overlay prevents users from reading blurred text while still showing content exists.

**Alternative considered:** Server-side truncation (don't send premium data to free users). Rejected because the blur-preview pattern requires the data to be present for the teaser effect — and server-side gating can be added later for true security.

### D5: Pro badge with click interception via wrapper

**Decision:** `ProBadge` renders a visual badge. For click interception, wrap the parent element with a gate-aware handler that checks tier and shows upgrade prompt instead of the original action.

**Rationale:** The badge itself is visual-only. Interception logic lives in the consuming component or a higher-order wrapper, keeping ProBadge simple and reusable.

### D6: Tracking limit — client pre-check + server hard enforcement

**Decision:** Both layers enforce tracking limits. Client shows a dialog pre-emptively (avoids API round-trip). Server rejects with `403 TRACKING_LIMIT_REACHED` as hard enforcement.

**Rationale:** Client-only gating can be bypassed. Server-only gating gives poor UX (error after network request). Both layers provide instant feedback + security.

### D7: Drop old `tier` column, use `subscription_tier` only

**Decision:** Create a migration to drop `profiles.tier` column. Update `getUserTier()` in profile repository to read `subscription_tier`. Update any code referencing the old column.

**Rationale:** Two tier columns create confusion. Migration 029 already set up `subscription_tier` with the correct three-tier values.

### D8: New `paywall.json` i18n file per locale

**Decision:** Create `src/messages/{locale}/paywall.json` rather than adding keys to `common.json`.

**Rationale:** Paywall text is a cohesive domain. Separate file keeps `common.json` from growing unbounded and makes paywall translations easy to find and update.

## Risks / Trade-offs

**[Risk] Blurred content is still in the DOM / network response** → Free users with dev tools can read it. This is acceptable for soft paywall — true security gating (not sending data) is a future enhancement. The goal is conversion UX, not DRM.

**[Risk] Old `tier` column removal breaks existing queries** → Migration must update any DB views, functions, or RLS policies referencing `tier`. Dry-run migration push will catch issues.

**[Risk] `getUserTier()` returns stale data during session** → React Query caching means tier changes (e.g., mid-session upgrade) may not reflect immediately. Acceptable for now; invalidation on upgrade event is future work.

**[Trade-off] Client-side gate state is trust-the-client** → Feature gates are UX-level, not security-level. Server-side enforcement exists for the critical path (subscription limits). For data access (argument cards), server gating is deferred.
