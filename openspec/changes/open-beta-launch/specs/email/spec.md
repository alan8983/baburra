## ADDED Requirements

### Requirement: Resend email client
The system SHALL provide a reusable Resend client at `src/infrastructure/email/resend.client.ts` that wraps the Resend SDK. The client SHALL read `RESEND_API_KEY` from environment. The client SHALL expose a `sendEmail(to, subject, reactComponent)` function that accepts a React Email component as the email body. The client SHALL log errors but NOT throw — email delivery failures MUST NOT block application flows.

#### Scenario: Send email successfully
- **WHEN** `sendEmail()` is called with valid parameters and Resend API key is configured
- **THEN** the email is sent via Resend API and the function returns `{ success: true, id: string }`

#### Scenario: Send email with missing API key
- **WHEN** `sendEmail()` is called but `RESEND_API_KEY` is not set
- **THEN** the function logs a warning and returns `{ success: false, error: 'RESEND_API_KEY not configured' }` without throwing

#### Scenario: Resend API error
- **WHEN** Resend API returns an error (rate limit, invalid email, etc.)
- **THEN** the function logs the error and returns `{ success: false, error: string }` without throwing

### Requirement: Waitlist confirmation email
The system SHALL send a waitlist confirmation email when a new user is placed on the waitlist. The email SHALL include: the user's queue position, a message that they will be notified when activated, and the Baburra.io branding. The email template SHALL be a React Email component at `src/infrastructure/email/templates/waitlist-confirm.tsx`.

#### Scenario: User waitlisted during registration
- **WHEN** a new user registers AND is placed on the waitlist (`status = 'waitlisted'`)
- **THEN** a waitlist confirmation email is sent to their registration email with their queue position

#### Scenario: Email delivery fails silently
- **WHEN** the waitlist confirmation email fails to send
- **THEN** the registration flow completes normally (user still sees waitlist page)

### Requirement: Waitlist activation email
The system SHALL send an activation email when a waitlisted user is activated. The email SHALL include: a welcome message, a direct link to log in, and the beta credit limit (5,000/week). The email template SHALL be a React Email component at `src/infrastructure/email/templates/waitlist-activated.tsx`.

#### Scenario: Admin activates waitlisted user
- **WHEN** admin calls `POST /api/admin/activate-users` with user IDs
- **THEN** each activated user receives an activation email

#### Scenario: Batch activation sends individual emails
- **WHEN** admin activates 10 users at once
- **THEN** 10 individual activation emails are sent (not one bulk email)

### Requirement: Beta welcome email
The system SHALL send a welcome email when a new user registers and is immediately active (under cap). The email SHALL include: welcome message, beta credit limit, quick-start guidance (link to scrape page), and feedback link. The email template SHALL be a React Email component at `src/infrastructure/email/templates/beta-welcome.tsx`.

#### Scenario: New user registers under cap
- **WHEN** a new user registers AND active user count is below USER_CAP
- **THEN** a beta welcome email is sent to their registration email

### Requirement: Admin activation API endpoint
A `POST /api/admin/activate-users` endpoint SHALL accept either `{ userIds: string[] }` or `{ count: number }` to activate specific users or the next N waitlisted users by `created_at` order. The endpoint SHALL be protected by an `ADMIN_SECRET` header check. The endpoint SHALL update `profiles.status` to `'active'` AND send activation emails for each user.

#### Scenario: Activate by user IDs
- **WHEN** admin calls with `{ userIds: ['id1', 'id2'] }` and valid ADMIN_SECRET
- **THEN** those users are activated and receive activation emails

#### Scenario: Activate next N users
- **WHEN** admin calls with `{ count: 5 }` and valid ADMIN_SECRET
- **THEN** the 5 oldest waitlisted users (by created_at) are activated and emailed

#### Scenario: Missing or invalid admin secret
- **WHEN** the request has no `x-admin-secret` header or it doesn't match `ADMIN_SECRET`
- **THEN** the endpoint returns 401 Unauthorized

#### Scenario: No waitlisted users to activate
- **WHEN** admin calls with `{ count: 5 }` but only 2 users are waitlisted
- **THEN** only 2 users are activated, response indicates `{ activated: 2, requested: 5 }`

### Requirement: Email sender identity
All emails SHALL be sent from a consistent sender: `Baburra.io <noreply@baburra.io>` (or Resend sandbox address during development). The sender address SHALL be configurable via `EMAIL_FROM` environment variable.

#### Scenario: Production sender
- **WHEN** `EMAIL_FROM` is set to `noreply@baburra.io`
- **THEN** all emails use that as the From address

#### Scenario: Default sender
- **WHEN** `EMAIL_FROM` is not set
- **THEN** emails use Resend's default sandbox sender
