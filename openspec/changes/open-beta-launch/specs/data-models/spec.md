## ADDED Requirements

### Requirement: Profile status column
The `profiles` table SHALL have a `status` column of type `TEXT NOT NULL DEFAULT 'active'` with a CHECK constraint: `status IN ('active', 'waitlisted')`. Existing profiles SHALL be backfilled with `'active'`.

#### Scenario: Existing user after migration
- **WHEN** migration runs on existing database
- **THEN** all existing profiles have `status = 'active'`

#### Scenario: New profile default
- **WHEN** a new profile is created without specifying status
- **THEN** `status` defaults to `'active'`

### Requirement: Postgres custom settings for billing
The migration SHALL set database-level custom settings: `app.billing_mode` (default `'production'`) and `app.user_cap` (default `'100'`). These settings SHALL be readable by RPCs via `current_setting()`.

#### Scenario: Settings available to RPCs
- **WHEN** `consume_credits()` calls `current_setting('app.billing_mode', true)`
- **THEN** it receives `'beta'` or `'production'`

#### Scenario: Default when unset
- **WHEN** `current_setting('app.billing_mode', true)` is called without the setting being configured
- **THEN** it returns NULL (and RPCs treat NULL as `'production'`)
