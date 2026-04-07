## ADDED Requirements

### Requirement: Subscription Tier Limits
The system SHALL define three tiers (`free`, `pro`, `max`) with per-tier limits for KOL tracking, monthly credits, and free Layer 2 unlocks.

#### Scenario: Free tier limits
- **WHEN** a user has `subscription_tier = 'free'`
- **THEN** `TIER_LIMITS.free` SHALL expose `kolTracking`, `monthlyCredits`, and `freeL2UnlocksPerMonth` as finite integers

#### Scenario: Max tier unlimited L2
- **WHEN** a user has `subscription_tier = 'max'`
- **THEN** `freeL2UnlocksPerMonth` SHALL be treated as unlimited and no quota check is performed

### Requirement: Monthly Credit Wallet
The system SHALL reset each user's `credit_balance` to their tier's `monthlyCredits` on a calendar-month boundary via the `consume_credits` RPC.

#### Scenario: First consumption after month boundary
- **WHEN** `consume_credits` is called and `credit_reset_at` is before the start of the current calendar month
- **THEN** the balance SHALL be reset to `TIER_LIMITS[tier].monthlyCredits` before the requested amount is deducted
- **AND** `credit_reset_at` SHALL be advanced to `now()`

#### Scenario: Insufficient credits
- **WHEN** `consume_credits` is called with an amount greater than the post-reset balance
- **THEN** the RPC SHALL return an error payload and not modify the balance

### Requirement: Layer 1 Access
The system SHALL grant every authenticated user (all tiers) unrestricted access to aggregated Layer 1 intel: KOL metadata, post counts, tickers covered, sentiment ratios, per-post one-line summaries.

#### Scenario: Free user views KOL list
- **WHEN** a Free user loads the KOL directory or a KOL header card
- **THEN** the user SHALL see all Layer 1 fields without gating

### Requirement: Layer 2 Unlock (KOL × Ticker Deep Dive)
The system SHALL gate Layer 2 content (full argument chain, backtest detail, stance timeline) behind a persistent per-user `(kol_id, stock_id)` unlock. Free users have a monthly quota of free unlocks; Pro and Max have unlimited access without recording unlock rows.

#### Scenario: Free user unlocks within quota
- **WHEN** a Free user has used fewer than `TIER_LIMITS.free.freeL2UnlocksPerMonth` Layer 2 unlocks this calendar month
- **AND** the user calls `POST /api/unlocks/layer2` with `{ kolId, stockId }`
- **THEN** the system SHALL insert a `content_unlocks` row with `unlock_type='kol_ticker'`, `target_key='{kolId}:{stockId}'`, `credits_paid=0`
- **AND** return `{ unlocked: true }`

#### Scenario: Free user exceeds quota
- **WHEN** a Free user has already used `freeL2UnlocksPerMonth` unlocks this month
- **AND** calls `POST /api/unlocks/layer2` for a new `(kolId, stockId)` pair
- **THEN** the system SHALL return HTTP 402 with `{ error: 'UpgradeRequired', reason: 'quota_exhausted' }`

#### Scenario: Pro or Max user accesses L2
- **WHEN** a Pro or Max user calls `POST /api/unlocks/layer2`
- **THEN** the system SHALL return `{ unlocked: true }` without writing to `content_unlocks`

#### Scenario: Idempotent re-unlock
- **WHEN** a Free user calls `POST /api/unlocks/layer2` for a `(kolId, stockId)` pair already present in `content_unlocks`
- **THEN** the system SHALL return `{ unlocked: true }` without incrementing quota usage or writing a duplicate row

### Requirement: Layer 3 Unlock (Stock Page)
The system SHALL gate Layer 3 content (cross-KOL stock page) by tier: Free is locked, Pro pays `UNLOCK_COSTS.layer3_stock_page` credits for a persistent per-stock unlock, Max has unlimited access.

#### Scenario: Free user attempts L3
- **WHEN** a Free user calls `POST /api/unlocks/layer3` with `{ stockId }`
- **THEN** the system SHALL return HTTP 402 with `{ error: 'UpgradeRequired', reason: 'tier_locked' }`

#### Scenario: Pro user unlocks with sufficient credits
- **WHEN** a Pro user with `credit_balance >= UNLOCK_COSTS.layer3_stock_page` calls `POST /api/unlocks/layer3`
- **THEN** the system SHALL atomically call `consume_credits` for the unlock cost
- **AND** insert a `content_unlocks` row with `unlock_type='stock_page'`, `target_key='{stockId}'`, `credits_paid=<cost>`
- **AND** return `{ unlocked: true, creditsRemaining: <new balance> }`

#### Scenario: Pro user with insufficient credits
- **WHEN** a Pro user with `credit_balance < UNLOCK_COSTS.layer3_stock_page` calls `POST /api/unlocks/layer3`
- **THEN** the system SHALL return HTTP 402 with `{ error: 'InsufficientCredits' }` and not insert an unlock row

#### Scenario: Max user accesses L3
- **WHEN** a Max user calls `POST /api/unlocks/layer3`
- **THEN** the system SHALL return `{ unlocked: true }` without charging credits or writing to `content_unlocks`

#### Scenario: Pro idempotent re-unlock
- **WHEN** a Pro user calls `POST /api/unlocks/layer3` for a `stockId` already present in `content_unlocks`
- **THEN** the system SHALL return `{ unlocked: true }` without charging credits again

### Requirement: Unlock Query Endpoint
The system SHALL expose `GET /api/unlocks` returning the authenticated user's unlock set, enabling clients to hydrate L2/L3 lock state on page load without per-item checks.

#### Scenario: Hydrate KOL page
- **WHEN** an authenticated user calls `GET /api/unlocks`
- **THEN** the system SHALL return `{ unlocks: Array<{ unlockType, targetKey, unlockedAt }> }` scoped to that user

### Requirement: Tier and Unlock Enforcement is Server-Side
The system SHALL perform all tier and unlock decisions on the server. Client-supplied tier or unlock state MUST NOT influence access control.

#### Scenario: Forged client tier
- **WHEN** a client-side request claims a higher tier than the server's `profiles.subscription_tier`
- **THEN** the server SHALL ignore the client claim and enforce the stored tier
