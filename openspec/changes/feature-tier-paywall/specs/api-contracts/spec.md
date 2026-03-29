## MODIFIED Requirements

### Requirement: Subscription API enforces tier-based tracking limits
The `POST /api/subscriptions` endpoint SHALL enforce KOL tracking limits based on the user's `subscription_tier`: free = 5, pro = 30, max = 100. When the limit is reached, the endpoint SHALL return HTTP 403 with error code `TRACKING_LIMIT_REACHED`, the current count, and the limit.

#### Scenario: Free user at tracking limit
- **WHEN** a free user with 5 active subscriptions sends `POST /api/subscriptions`
- **THEN** the server SHALL return `403 { error: 'TRACKING_LIMIT_REACHED', limit: 5, current: 5 }`

#### Scenario: Pro user within tracking limit
- **WHEN** a pro user with 15 active subscriptions sends `POST /api/subscriptions`
- **THEN** the server SHALL create the subscription and return `201`

#### Scenario: Free user within tracking limit
- **WHEN** a free user with 3 active subscriptions sends `POST /api/subscriptions`
- **THEN** the server SHALL create the subscription and return `201`
