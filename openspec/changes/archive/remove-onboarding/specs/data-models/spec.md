## ADDED Requirements

### Requirement: First import free column
The `profiles` table SHALL have a `first_import_free BOOLEAN DEFAULT TRUE` column to track whether the user is eligible for a free first batch import.

#### Scenario: Column exists with correct default
- **WHEN** a new row is inserted into `profiles`
- **THEN** `first_import_free` SHALL default to `TRUE`

## REMOVED Requirements

### Requirement: Onboarding columns on profiles
**Reason**: Onboarding flow removed; these columns are no longer used
**Migration**: Drop columns via migration. Data mapped to `first_import_free` before drop.

The following columns SHALL be dropped from `profiles`:
- `onboarding_completed`
- `onboarding_completed_at`
- `onboarding_import_used`

### Requirement: A/B experiments table
**Reason**: The only A/B experiment (`ONBOARDING_BEFORE_REG`) is being removed. The `ab_experiments` table and related infrastructure can remain in the database (not dropped) but the experiment data is no longer actively used.
**Migration**: No DB change — table remains but is inactive. Code references to the experiment are removed.
