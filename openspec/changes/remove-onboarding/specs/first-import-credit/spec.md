## ADDED Requirements

### Requirement: First import credit flag on profile
The system SHALL maintain a `first_import_free` boolean column on `profiles` that defaults to `TRUE` for new users. This flag grants one free batch import without consuming AI quota.

#### Scenario: New user gets free first import
- **WHEN** a new user account is created
- **THEN** `profiles.first_import_free` SHALL be `TRUE`

#### Scenario: Free import consumed
- **WHEN** a user with `first_import_free = TRUE` completes a batch import (via Quick Input or profile scrape)
- **THEN** the system SHALL set `first_import_free = FALSE`
- **AND** the AI quota SHALL NOT be consumed for that import

#### Scenario: Subsequent imports consume quota
- **WHEN** a user with `first_import_free = FALSE` performs a batch import
- **THEN** the system SHALL consume AI quota as normal

### Requirement: Migration preserves existing free-import state
The migration SHALL map existing `onboarding_import_used` data to `first_import_free` so no user gets a double free import.

#### Scenario: User who already used onboarding import
- **WHEN** migration runs for a user with `onboarding_import_used = TRUE`
- **THEN** `first_import_free` SHALL be set to `FALSE`

#### Scenario: User who never used onboarding import
- **WHEN** migration runs for a user with `onboarding_import_used = FALSE` or `NULL`
- **THEN** `first_import_free` SHALL be set to `TRUE`
