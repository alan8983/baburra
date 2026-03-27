## 1. Environment & Authentication

- [x] 1.1 Add `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` to `.env.example` with descriptions
- [x] 1.2 Prompt user for access token and DB password, add to `.env.local`
- [x] 1.3 Link project: `supabase link --project-ref jinxqfsejfrhmvlhrfjj`
- [x] 1.4 Verify: run `supabase migration list` and confirm it returns local vs remote status

## 2. Fix Migration Numbering

- [x] 2.1 Rename `025_sentiment_scale_expansion.sql` → `026_sentiment_scale_expansion.sql`
- [x] 2.2 Rename `026_scrape_jobs_filtered_count.sql` → `027_scrape_jobs_filtered_count.sql`
- [x] 2.3 Rename `027_argument_statement_type.sql` → `028_argument_statement_type.sql`
- [x] 2.4 Update remote `supabase_migrations` table: rename the three affected entries to match new filenames
- [x] 2.5 Verify: run `supabase migration list` and confirm all migrations show as applied

## 3. TypeScript Type Generation

- [x] 3.1 Run `supabase gen types typescript --linked` and write output to `src/infrastructure/supabase/database.types.ts`
- [x] 3.2 Verify the generated types compile: `npm run type-check`

## 4. Documentation

- [x] 4.1 Update CLAUDE.md: add Supabase CLI section with safe command tiers (free / confirm / never)
- [x] 4.2 Update CLAUDE.md: add workflow guidance for migrations + type regeneration
- [x] 4.3 Update CLAUDE.md: add `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` to the Required Variables section
