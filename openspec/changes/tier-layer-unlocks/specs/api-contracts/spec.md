## ADDED Requirements

### Requirement: Layer 2 Unlock Endpoint
The system SHALL expose `POST /api/unlocks/layer2` accepting `{ kolId: string, stockId: string }` and enforcing the tier-unlocks rules for Layer 2.

#### Scenario: Free user within quota
- **WHEN** an authenticated Free user with remaining monthly L2 quota POSTs `{ kolId, stockId }`
- **THEN** the endpoint SHALL return HTTP 200 with `{ unlocked: true, quotaRemaining: <int> }`

#### Scenario: Free user over quota
- **WHEN** an authenticated Free user with zero remaining monthly L2 quota POSTs a new `(kolId, stockId)`
- **THEN** the endpoint SHALL return HTTP 402 with `{ error: 'UpgradeRequired', reason: 'quota_exhausted' }`

### Requirement: Layer 3 Unlock Endpoint
The system SHALL expose `POST /api/unlocks/layer3` accepting `{ stockId: string }` and enforcing the tier-unlocks rules for Layer 3.

#### Scenario: Pro user with credits
- **WHEN** an authenticated Pro user with sufficient credits POSTs `{ stockId }`
- **THEN** the endpoint SHALL deduct `UNLOCK_COSTS.layer3_stock_page` credits atomically and return HTTP 200 with `{ unlocked: true, creditsRemaining: <int> }`

#### Scenario: Free user attempt
- **WHEN** an authenticated Free user POSTs `{ stockId }`
- **THEN** the endpoint SHALL return HTTP 402 with `{ error: 'UpgradeRequired', reason: 'tier_locked' }`

#### Scenario: Pro user insufficient credits
- **WHEN** an authenticated Pro user with credits below `UNLOCK_COSTS.layer3_stock_page` POSTs `{ stockId }`
- **THEN** the endpoint SHALL return HTTP 402 with `{ error: 'InsufficientCredits' }`

### Requirement: Unlock List Endpoint
The system SHALL expose `GET /api/unlocks` returning the authenticated user's full unlock set.

#### Scenario: Authenticated fetch
- **WHEN** an authenticated user GETs `/api/unlocks`
- **THEN** the endpoint SHALL return HTTP 200 with `{ unlocks: Array<{ unlockType: 'kol_ticker' | 'stock_page', targetKey: string, unlockedAt: string }> }`

#### Scenario: Unauthenticated fetch
- **WHEN** an unauthenticated request GETs `/api/unlocks`
- **THEN** the endpoint SHALL return HTTP 401
