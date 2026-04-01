## ADDED Requirements

### Requirement: Registration cap enforcement
The `handle_new_user()` trigger SHALL count active profiles. When the count is >= `USER_CAP` (from Postgres setting `app.user_cap`, default 100), new users SHALL be created with `status = 'waitlisted'` instead of `'active'`. The count check SHALL use a row-level lock to prevent race conditions.

#### Scenario: Registration within cap
- **WHEN** a new user registers AND active user count is below USER_CAP
- **THEN** profile is created with `status = 'active'`

#### Scenario: Registration at cap
- **WHEN** a new user registers AND active user count equals USER_CAP
- **THEN** profile is created with `status = 'waitlisted'`

#### Scenario: Concurrent registration race condition
- **WHEN** two users register simultaneously at the cap boundary
- **THEN** at most one receives `status = 'active'`; the other receives `'waitlisted'`

### Requirement: Middleware waitlist enforcement
The middleware SHALL check `profiles.status` for authenticated users. Users with `status = 'waitlisted'` SHALL be redirected to `/waitlist` for page routes and receive 403 for API routes. The `/waitlist` route SHALL be accessible to waitlisted users.

#### Scenario: Waitlisted user accesses app page
- **WHEN** a waitlisted user navigates to `/scrape`
- **THEN** they are redirected to `/waitlist`

#### Scenario: Waitlisted user accesses API
- **WHEN** a waitlisted user calls `POST /api/import/batch`
- **THEN** they receive a 403 response

#### Scenario: Active user accesses app normally
- **WHEN** an active user navigates to `/scrape`
- **THEN** the page loads normally (no redirect)

#### Scenario: Waitlisted user accesses waitlist page
- **WHEN** a waitlisted user navigates to `/waitlist`
- **THEN** the waitlist page renders (no redirect loop)

### Requirement: Waitlist page with queue position
The `/waitlist` page SHALL display the user's position in the waitlist queue. Position is calculated as the count of waitlisted profiles with `created_at` before the current user's `created_at`, plus 1. The page SHALL show: queue position, a "we'll notify you" message, and a logout option.

#### Scenario: User sees queue position
- **WHEN** a waitlisted user views `/waitlist`
- **THEN** they see their queue position (e.g., "#12 in queue")

#### Scenario: Queue position updates
- **WHEN** a waitlisted user ahead in the queue is activated
- **THEN** the current user's queue position decreases on next page load

### Requirement: Admin activation of waitlisted users
Waitlisted users SHALL be activatable via `POST /api/admin/activate-users` endpoint, which updates `profiles.status` to `'active'` AND sends activation emails. The endpoint accepts `{ userIds }` or `{ count }` for batch activation in `created_at` order.

#### Scenario: Admin activates specific users
- **WHEN** admin calls `POST /api/admin/activate-users` with `{ userIds: ['id1'] }`
- **THEN** user status is set to `'active'` AND an activation email is sent

#### Scenario: Admin batch-activates next N users
- **WHEN** admin calls `POST /api/admin/activate-users` with `{ count: 50 }`
- **THEN** the next 50 waitlisted users (by created_at) are activated and emailed

### Requirement: Registration page waitlist messaging
The registration page SHALL display a notice when the system is at or near capacity. When at capacity, the notice SHALL say "Beta is full — you'll be added to the waitlist." When near capacity (>80%), the notice SHALL say "Limited spots remaining."

#### Scenario: At capacity registration
- **WHEN** a user visits `/register` AND active users >= USER_CAP
- **THEN** a notice displays "Beta is full — you'll be added to the waitlist"

#### Scenario: Near capacity registration
- **WHEN** a user visits `/register` AND active users >= 80% of USER_CAP
- **THEN** a notice displays "Limited spots remaining"

#### Scenario: Under capacity registration
- **WHEN** a user visits `/register` AND active users < 80% of USER_CAP
- **THEN** no capacity notice is shown
