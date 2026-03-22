## MODIFIED Requirements

### Requirement: Quota Management
- Weekly AI usage tracked in `profiles.ai_usage_count`
- Reset via `profiles.ai_usage_reset_at`
- First import is quota-exempt via `profiles.first_import_free` flag
- Profile scrape jobs are quota-exempt (`quotaExempt: true`)
- Atomic operations: `consume_ai_quota()` and `refund_ai_quota()` DB functions

#### Scenario: First import exemption via first_import_free
- **WHEN** a batch import runs for a user with `first_import_free = TRUE`
- **THEN** AI quota SHALL NOT be consumed
- **AND** `first_import_free` SHALL be set to `FALSE`

#### Scenario: Normal quota consumption
- **WHEN** a batch import runs for a user with `first_import_free = FALSE`
- **THEN** AI quota SHALL be consumed normally via `consume_ai_quota()`

## REMOVED Requirements

### Requirement: Onboarding import exemption
**Reason**: Replaced by `first_import_free` flag — decoupled from onboarding flow
**Migration**: All code checking `onboarding_import_used` SHALL use `first_import_free` instead. Repository functions `checkOnboardingImportUsed()` and `markOnboardingImportUsed()` SHALL be replaced with `checkFirstImportFree()` and `markFirstImportUsed()`.
