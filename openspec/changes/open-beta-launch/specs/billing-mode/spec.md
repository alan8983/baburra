## ADDED Requirements

### Requirement: Billing mode constant
The system SHALL expose a `BILLING_MODE` constant with value `'beta'` or `'production'`, sourced from the `BILLING_MODE` environment variable. When unset, it SHALL default to `'production'`.

#### Scenario: Beta mode configured
- **WHEN** `BILLING_MODE=beta` is set in environment
- **THEN** `BILLING_MODE` constant equals `'beta'`

#### Scenario: Production mode by default
- **WHEN** `BILLING_MODE` environment variable is not set
- **THEN** `BILLING_MODE` constant equals `'production'`

### Requirement: Beta credit limit override
The `consume_credits()` RPC SHALL use 5,000 as the weekly credit limit for ALL users when billing mode is `'beta'`, regardless of `subscription_tier`. When billing mode is `'production'`, existing tier-based limits (700/4200/21000) SHALL apply.

#### Scenario: Beta mode credit consumption
- **WHEN** billing mode is `'beta'` AND a free-tier user consumes credits
- **THEN** the weekly limit enforced is 5,000 (not 700)

#### Scenario: Production mode credit consumption
- **WHEN** billing mode is `'production'` AND a free-tier user consumes credits
- **THEN** the weekly limit enforced is 700

#### Scenario: Beta mode weekly reset
- **WHEN** billing mode is `'beta'` AND a user's credit cycle resets
- **THEN** balance resets to 5,000

### Requirement: Beta refund cap override
The `refund_credits()` RPC SHALL cap refunds at 5,000 when billing mode is `'beta'`, regardless of `subscription_tier`.

#### Scenario: Refund in beta mode
- **WHEN** billing mode is `'beta'` AND a refund would exceed the weekly limit
- **THEN** credit balance is capped at 5,000

### Requirement: Feature gate bypass in beta mode
`getFeatureAccess()` SHALL return `{ gate: 'full_access' }` for all features when billing mode is `'beta'`. The existing feature map and tier logic SHALL remain in the codebase unchanged.

#### Scenario: Blur-gated feature in beta
- **WHEN** billing mode is `'beta'` AND a free-tier user accesses `argument_cards`
- **THEN** `getFeatureAccess` returns `gate: 'full_access'`

#### Scenario: Locked feature in beta
- **WHEN** billing mode is `'beta'` AND a free-tier user accesses `api_access`
- **THEN** `getFeatureAccess` returns `gate: 'full_access'`

#### Scenario: Feature gate restored in production
- **WHEN** billing mode is `'production'` AND a free-tier user accesses `argument_cards`
- **THEN** `getFeatureAccess` returns `gate: 'blur_gate'` (existing behavior)

### Requirement: KOL tracking limit override in beta mode
`TIER_LIMITS` SHALL return a kolTracking limit of 50 for all tiers when billing mode is `'beta'`. In production, existing limits (5/30/100) SHALL apply.

#### Scenario: KOL tracking in beta
- **WHEN** billing mode is `'beta'` AND a free-tier user subscribes to KOLs
- **THEN** the tracking limit is 50

### Requirement: Beta banner display
The app layout SHALL render a `<BetaBanner />` component when billing mode is `'beta'`. The banner SHALL display the beta credit limit and a feedback link. The banner SHALL be dismissible per browser session.

#### Scenario: Banner shown in beta
- **WHEN** billing mode is `'beta'` AND user views any app page
- **THEN** a beta banner is visible at the top

#### Scenario: Banner not shown in production
- **WHEN** billing mode is `'production'`
- **THEN** no beta banner is rendered

#### Scenario: Banner dismissal persists within session
- **WHEN** user dismisses the beta banner
- **THEN** the banner remains hidden for the rest of the browser session

### Requirement: Client-side billing mode exposure
A `src/lib/constants/billing.ts` module SHALL export `BILLING_MODE`, `BETA_CREDIT_LIMIT` (5000), and `USER_CAP`. These SHALL be available to client components via `NEXT_PUBLIC_BILLING_MODE` env var for display purposes.

#### Scenario: Client reads billing mode
- **WHEN** a client component imports from `billing.ts`
- **THEN** it receives the current billing mode and beta credit limit

### Requirement: Upgrade prompt suppression in beta
Paywall components (blur gate, pro badge, upgrade prompt, tracking limit gate) SHALL render as pass-through (no blur, no lock, no prompt) when billing mode is `'beta'`. No paywall code SHALL be deleted.

#### Scenario: Blur gate in beta mode
- **WHEN** billing mode is `'beta'` AND `<BlurGate>` wraps content
- **THEN** all children render without blur effect or upgrade CTA
