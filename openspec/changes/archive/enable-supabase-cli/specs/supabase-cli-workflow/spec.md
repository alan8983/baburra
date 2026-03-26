## ADDED Requirements

### Requirement: Supabase CLI authentication via environment variable
The system SHALL authenticate with Supabase CLI using the `SUPABASE_ACCESS_TOKEN` environment variable defined in `.env.local`. The project SHALL be linked to the remote Supabase project using `supabase link`.

#### Scenario: CLI authenticates successfully
- **WHEN** `SUPABASE_ACCESS_TOKEN` is set in `.env.local` and the project is linked
- **THEN** `supabase migration list` SHALL return the list of local and remote migrations without error

#### Scenario: Missing access token
- **WHEN** `SUPABASE_ACCESS_TOKEN` is not set
- **THEN** Supabase CLI commands SHALL fail with an authentication error message

### Requirement: Environment variables documented in .env.example
`.env.example` SHALL include `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` with descriptions indicating they are required for CLI operations.

#### Scenario: New developer setup
- **WHEN** a developer copies `.env.example` to `.env.local`
- **THEN** they SHALL see `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` fields with guidance on where to obtain values

### Requirement: CLAUDE.md documents safe command tiers
CLAUDE.md SHALL document Supabase CLI commands in three safety tiers: free-to-run (read-only), run-with-confirmation (write), and never-run (destructive).

#### Scenario: Claude Code runs a read-only command
- **WHEN** Claude Code needs to check migration status
- **THEN** it SHALL run `supabase migration list` without requiring user confirmation

#### Scenario: Claude Code applies migrations
- **WHEN** Claude Code needs to push migrations to the remote database
- **THEN** it SHALL first run `supabase db push --dry-run`, show the output to the user, and only proceed with `supabase db push` after user confirmation

#### Scenario: Destructive command requested
- **WHEN** a task would require `db reset`, `migration repair`, or `db push --include-all`
- **THEN** Claude Code SHALL refuse and explain the risk to the user

### Requirement: TypeScript type generation from database schema
The system SHALL support generating TypeScript types from the remote database schema using `supabase gen types typescript` and outputting to `src/infrastructure/supabase/database.types.ts`.

#### Scenario: Generate types after migration
- **WHEN** a new migration is applied via `supabase db push`
- **THEN** `supabase gen types typescript --linked > src/infrastructure/supabase/database.types.ts` SHALL produce an updated types file reflecting the current schema

#### Scenario: Types file is checked into git
- **WHEN** types are regenerated
- **THEN** the updated `database.types.ts` SHALL be committed to git so that type checking works without CLI access
