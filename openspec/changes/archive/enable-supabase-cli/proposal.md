## Why

The Supabase CLI (v2.75.5) is installed but not configured — no access token, no linked project, no DB password. This means Claude Code cannot run any Supabase commands (migration list, db push, gen types) during development sessions. Additionally, there's a duplicate migration numbering issue (two `025_*` files) that will cause problems with `db push`. Setting this up enables Claude Code to manage migrations, generate TypeScript types, and inspect the database autonomously.

## What Changes

- Add `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` to `.env.example` as required variables
- Link the Supabase project (`jinxqfsejfrhmvlhrfjj`) so CLI commands work against the remote DB
- Fix duplicate migration numbering: rename `025_sentiment_scale_expansion.sql` → `026_sentiment_scale_expansion.sql` and cascade-renumber `026_*` → `027_*`, `027_*` → `028_*`
- Update CLAUDE.md with Supabase CLI usage guidance (which commands are safe, workflow for migrations + type generation)
- Add `supabase gen types` workflow so TypeScript types stay in sync with DB schema after migrations

## Capabilities

### New Capabilities
- `supabase-cli-workflow`: Supabase CLI configuration, safe command patterns, and integration with Claude Code development workflow (migrations, type generation, inspection)

### Modified Capabilities
- `data-models`: Migration numbering fix (025 collision → proper sequential ordering)

## Impact

- **Environment**: `.env.example` gains two new required variables; `.env.local` needs them filled in
- **Migrations**: Files `025_sentiment_scale_expansion.sql` through `027_argument_statement_type.sql` will be renumbered. The remote `supabase_migrations` history table must be updated to match.
- **Developer workflow**: CLAUDE.md updated with Supabase CLI commands and safety guidelines
- **Type generation**: New generated types file (e.g., `src/infrastructure/supabase/database.types.ts`) from `supabase gen types`
