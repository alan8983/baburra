## MODIFIED Requirements

### Requirement: Migration file numbering
Migration files in `supabase/migrations/` SHALL use sequential numeric prefixes with no duplicates and no gaps that cause ordering ambiguity. Each migration file SHALL have a unique numeric prefix.

#### Scenario: Fix duplicate 025 prefix
- **WHEN** the migration directory contains two files with prefix `025_`
- **THEN** `025_sentiment_scale_expansion.sql` SHALL be renamed to `026_sentiment_scale_expansion.sql`, and subsequent files SHALL be renumbered: `026_` → `027_`, `027_` → `028_`

#### Scenario: Remote history table matches local filenames
- **WHEN** migration files are renumbered locally
- **THEN** the `supabase_migrations.name` column in the remote database SHALL be updated to match the new filenames, so that `supabase migration list` shows all migrations as applied
