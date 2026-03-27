## Context

Supabase CLI v2.75.5 is installed via npx but not authenticated or linked to the remote project (`jinxqfsejfrhmvlhrfjj`). The project has 27 local migration files with a numbering collision at `025_*`. Currently, all DB changes are applied manually through the Supabase dashboard or ad-hoc SQL. Claude Code cannot verify migration status, push migrations, or generate types.

## Goals / Non-Goals

**Goals:**
- Authenticate and link Supabase CLI to the remote project
- Fix the `025_*` migration numbering collision safely
- Enable Claude Code to run non-destructive Supabase commands autonomously
- Set up `supabase gen types` to keep TypeScript types in sync with DB schema
- Document safe vs dangerous commands in CLAUDE.md

**Non-Goals:**
- Running Supabase local development stack (Docker containers) — not needed since we connect to hosted Supabase
- Automating migration creation (stay manual/intentional)
- Setting up Supabase Edge Functions locally
- Changing the existing repository pattern or data access layer

## Decisions

### 1. Authentication: `SUPABASE_ACCESS_TOKEN` env var (not `supabase login`)

`supabase login` stores tokens in a user-profile config file, which doesn't work across worktrees or CI. Using `SUPABASE_ACCESS_TOKEN` in `.env.local` is portable and works identically in all contexts.

**Alternative considered:** `supabase login` — rejected because it's session-based and doesn't persist across worktrees.

### 2. Migration renumbering: Rename files + update remote history table

The two `025_*` files both exist in production (applied in the same commit). The fix:
1. Rename `025_sentiment_scale_expansion.sql` → `026_sentiment_scale_expansion.sql`
2. Cascade: `026_scrape_jobs_filtered_count.sql` → `027_*`, `027_argument_statement_type.sql` → `028_*`
3. Update the `supabase_migrations.name` column in the remote DB to match new filenames

**Alternative considered:** Leave as-is — rejected because `supabase db push` will fail on duplicate prefixes, and it creates confusion about ordering.

### 3. Type generation: `supabase gen types typescript` → checked-in file

Generate types to `src/infrastructure/supabase/database.types.ts`. Check the file into git so:
- IDEs get type hints without running the CLI
- CI doesn't need Supabase credentials for type checking
- Drift between schema and types is visible in PRs

**Alternative considered:** Generate on-the-fly in CI — rejected because it adds CI complexity and requires secrets in CI.

### 4. CLAUDE.md command safety tiers

Document commands in three tiers:
- **Free to run** (read-only): `migration list`, `db push --dry-run`, `inspect db-*`, `gen types`
- **Run with confirmation**: `db push` (applies migrations), `migration new`
- **Never run**: `db reset`, `migration repair`, `db push --include-all`

## Risks / Trade-offs

- **[Risk] Renaming applied migrations breaks remote history** → Mitigation: Update `supabase_migrations` table via SQL to match new filenames before running `db push`. Verify with `migration list` afterward.
- **[Risk] Access token in `.env.local` could leak** → Mitigation: `.env*` is already gitignored. Add a note in `.env.example` that this is a personal token.
- **[Risk] Generated types file goes stale** → Mitigation: Add a reminder in CLAUDE.md to regenerate types after any migration. Could add a git hook later if needed.
- **[Trade-off] Checking in generated types adds noise to diffs** → Accepted: The benefit of always-available types outweighs occasional diff noise.
