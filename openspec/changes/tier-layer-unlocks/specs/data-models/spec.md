## ADDED Requirements

### Requirement: content_unlocks Table
The system SHALL persist Layer 2 and Layer 3 unlocks in a `content_unlocks` table keyed by `(user_id, unlock_type, target_key)` with a uniqueness constraint preventing duplicate unlocks.

#### Scenario: Table shape
- **WHEN** migration `031_monthly_credits_and_unlocks.sql` is applied
- **THEN** a `content_unlocks` table SHALL exist with columns: `id uuid pk`, `user_id uuid fk auth.users on delete cascade`, `unlock_type text check in ('kol_ticker','stock_page')`, `target_key text not null`, `credits_paid int not null default 0`, `unlocked_at timestamptz not null default now()`
- **AND** a unique constraint on `(user_id, unlock_type, target_key)`
- **AND** an index on `(user_id, unlock_type)`

#### Scenario: Cascading delete
- **WHEN** an `auth.users` row is deleted
- **THEN** all matching `content_unlocks` rows SHALL be deleted by the cascade

## MODIFIED Requirements

### Requirement: profiles.credit_reset_at semantics
The `profiles.credit_reset_at` column SHALL represent the start of the current **monthly** credit window. The `consume_credits` RPC SHALL reset `credit_balance` to the tier's `monthlyCredits` when `credit_reset_at` falls before the start of the current calendar month.

#### Scenario: Monthly reset on consumption
- **WHEN** `consume_credits` is invoked for a user whose `credit_reset_at` is before `date_trunc('month', now())`
- **THEN** the RPC SHALL set `credit_balance` to the tier's monthly allotment and `credit_reset_at` to `now()` before deducting the requested amount

#### Scenario: Within-month consumption
- **WHEN** `consume_credits` is invoked and `credit_reset_at >= date_trunc('month', now())`
- **THEN** the RPC SHALL deduct from the current balance without resetting
