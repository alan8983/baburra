## Why

Baburra uses a shared data model where all KOLs, posts, and AI analysis live in a common pool. This maximises data network effects but creates a monetisation gap: if everything is freely accessible, there's no reason to upgrade. The feature tier system solves this by letting free users experience the product's value (K-line charts, win rates, notifications) while gating the depth of analysis (argument cards, win rate breakdown, KOL comparison) behind soft paywalls that drive upgrade conversions. The "leaky" paywall design creates curiosity-driven motivation — free users see that premium content exists and glimpse its quality — rather than hard blocks that frustrate before users understand the product.

## What Changes

- **Feature gate service** — centralised tier-checking logic (`getFeatureAccess`) that returns gate type (full_access / blur_gate / pro_badge / locked) for any feature + user tier combination, replacing scattered tier checks
- **React hook (`useFeatureGate`)** — components consume this hook to get gate state for any feature, reading tier from existing profile/credit info
- **Tier constants consolidation** — single source of truth for KOL tracking limits and weekly credits per tier (free/pro/max), replacing the old `SUBSCRIPTION_LIMITS` two-tier system
- **Blur gate component** — wrapper that renders first N children normally, applies CSS blur + gradient overlay on the rest, with upgrade CTA
- **Pro badge component** — pill badge + lock indicator on buttons/menu items; intercepts clicks for free users and shows upgrade prompt
- **Tracking limit intercept** — dialog when free users hit KOL subscription cap, showing current tracked KOLs with swap option
- **Upgrade prompt modal** — shared modal triggered by blur gate CTA and pro badge clicks, showing tier comparison and upgrade action
- **Server-side tracking limit enforcement** — hard enforcement in subscription API using new three-tier limits (5/30/100)
- **Client-side pre-check** — subscription hook checks local count against limit before calling API
- **i18n** — all paywall text in zh-TW and en

## Capabilities

### New Capabilities
- `feature-gate`: Centralised feature access control service, tier constants, and React hook for checking feature availability per user tier
- `paywall-ui`: Soft paywall UI components — blur gate, pro badge, tracking limit intercept, and upgrade prompt modal

### Modified Capabilities
- `api-contracts`: Subscription POST endpoint gains server-side three-tier tracking limit enforcement (5/30/100 replacing 10/50)
- `data-models`: Reconcile `profiles.tier` (free/paid) with `profiles.subscription_tier` (free/pro/max) — drop redundant column or update CHECK constraint

## Impact

- **API routes**: `POST /api/subscriptions` — updated limit enforcement using new tier constants
- **Hooks**: `useSubscriptions` — client-side pre-check added; new `useFeatureGate` hook
- **Components**: New paywall components in `src/components/paywall/`; post detail argument section and KOL stats tab gain blur gates; subscribe action gains tracking intercept
- **Constants**: `src/lib/constants/config.ts` `SUBSCRIPTION_LIMITS` replaced by `src/lib/constants/tiers.ts` `TIER_LIMITS`
- **Domain services**: New `src/domain/services/feature-gate.service.ts`
- **i18n**: New translation keys in `common.json` or new `paywall.json` for both locales
- **DB**: Possible migration to drop old `tier` column or update CHECK constraint
