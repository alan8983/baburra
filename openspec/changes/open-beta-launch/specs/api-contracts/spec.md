## ADDED Requirements

### Requirement: Waitlist enforcement in middleware
The Next.js middleware SHALL query `profiles.status` for authenticated users on protected routes. Users with `status = 'waitlisted'` SHALL receive a redirect to `/waitlist` (page routes) or 403 JSON response (API routes).

#### Scenario: Waitlisted user page request
- **WHEN** authenticated user with `status = 'waitlisted'` requests `/scrape`
- **THEN** middleware returns 302 redirect to `/waitlist`

#### Scenario: Waitlisted user API request
- **WHEN** authenticated user with `status = 'waitlisted'` requests `POST /api/import/batch`
- **THEN** middleware returns `{ "error": "Waitlisted" }` with status 403

#### Scenario: Active user passes through
- **WHEN** authenticated user with `status = 'active'` requests any protected route
- **THEN** middleware passes request through (existing behavior)

### Requirement: Waitlist position API
A `GET /api/waitlist/position` endpoint SHALL return the current user's queue position and total waitlisted count. Returns 404 if user is not waitlisted.

#### Scenario: Waitlisted user checks position
- **WHEN** waitlisted user calls `GET /api/waitlist/position`
- **THEN** response includes `{ position: number, total: number }`

#### Scenario: Active user checks position
- **WHEN** active user calls `GET /api/waitlist/position`
- **THEN** response returns 404

### Requirement: Registration capacity API
A `GET /api/auth/capacity` endpoint (public, no auth required) SHALL return `{ activeUsers: number, cap: number, status: 'open' | 'near_capacity' | 'full' }`. This enables the registration page to show capacity messaging without authentication.

#### Scenario: Under capacity
- **WHEN** active users < 80% of cap
- **THEN** returns `status: 'open'`

#### Scenario: Near capacity
- **WHEN** active users >= 80% of cap AND < cap
- **THEN** returns `status: 'near_capacity'`

#### Scenario: At capacity
- **WHEN** active users >= cap
- **THEN** returns `status: 'full'`
