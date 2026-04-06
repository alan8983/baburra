## MODIFIED Requirements

### Requirement: Profiles table uses subscription_tier as single tier column
The `profiles` table SHALL use `subscription_tier` (values: `'free'` | `'pro'` | `'max'`) as the sole tier column. The legacy `tier` column (values: `'free'` | `'paid'`) SHALL be dropped. The `getUserTier()` repository function SHALL read from `subscription_tier`.

#### Scenario: New user has free subscription tier
- **WHEN** a new user profile is created
- **THEN** `subscription_tier` SHALL default to `'free'`

#### Scenario: getUserTier reads subscription_tier
- **WHEN** `getUserTier(userId)` is called for a user with `subscription_tier = 'pro'`
- **THEN** it SHALL return `'pro'`

#### Scenario: Legacy tier column is removed
- **WHEN** the migration is applied
- **THEN** the `tier` column SHALL no longer exist on the `profiles` table
