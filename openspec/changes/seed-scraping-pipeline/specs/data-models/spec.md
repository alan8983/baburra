## ADDED Requirements

### Requirement: Source Marker on Ingested Rows

The `kol_sources` and `posts` tables SHALL include a nullable `source TEXT` column with a CHECK constraint restricting values to `'seed'`, `'user'`, or NULL, so platform-seeded data can be distinguished from organic user contributions.

#### Scenario: Column exists on both tables
- **WHEN** a developer inspects the schema
- **THEN** both `kol_sources.source` and `posts.source` exist with the CHECK constraint
- **AND** the column is nullable with no default backfill applied to pre-existing rows

#### Scenario: Analytics can filter by source
- **WHEN** a query runs `SELECT count(*) FROM posts WHERE source = 'seed'`
- **THEN** it returns only posts written by the seed script

#### Scenario: KOL source filtering
- **WHEN** a query runs `SELECT * FROM kol_sources WHERE source = 'seed'`
- **THEN** it returns only KOL sources created by the seed script

### Requirement: Platform System User

The system SHALL provision exactly one auth user row with email `platform@baburra.com` whose UUID acts as the owner for all seed-sourced KOLs, kol_sources, scrape_jobs, and posts.

#### Scenario: Platform user seeded once
- **WHEN** the `add_source_and_system_user` migration runs on any environment
- **THEN** `auth.users` contains exactly one row with email `platform@baburra.com`
- **AND** running the migration again does not duplicate the row or raise an error

#### Scenario: Platform UUID is referenced as a constant
- **WHEN** application or script code needs to write seed-owned rows
- **THEN** it reads the platform UUID from a named constant or env var, not a hard-coded inline string
