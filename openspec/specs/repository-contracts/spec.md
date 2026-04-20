# repository-contracts Specification

## Purpose

Baburra's infrastructure repositories (`src/infrastructure/repositories/`) bypass Postgres RLS by using the Supabase service-role key (`createAdminClient()`). That moves the entire authorization boundary into the application layer — the database itself will execute any read or mutation the code asks for. This spec defines the conventions every repository must follow so that "application-layer authorization" stays a real, testable contract rather than a convention that drifts.

The rules here apply to all files under `src/infrastructure/repositories/` and are verified by the ownership integration tests under `src/infrastructure/repositories/__tests__/*.ownership.integration.test.ts`.

## Requirements

### Requirement: Admin client usage (R1)

Every repository module SHALL obtain its Supabase handle via `createAdminClient()` from `@/infrastructure/supabase/admin`. Repositories SHALL NOT accept a `SupabaseClient` as a parameter, and SHALL NOT import `createServerClient()` or `createClient()` (the browser client) directly.

**Rationale:** Mixing client types inside a repository makes the authorization surface non-uniform. Repos that speak through the admin client have a predictable threat model; repos that speak through the anon/server clients depend on RLS for the same guarantees, and the codebase does not currently use RLS for business tables.

#### Scenario: A new repository module is added
- **WHEN** a new file is added under `src/infrastructure/repositories/`
- **THEN** its data-access functions import `createAdminClient` from `@/infrastructure/supabase/admin` and no other Supabase client factory

### Requirement: Ownership parameter on user-scoped mutations (R2)

A repository function that mutates a user-scoped row (i.e. a row whose table has a user-identity column such as `user_id`, `created_by`, `triggered_by`) SHALL accept the caller's `userId: string` as a parameter. It SHALL NOT derive the user id from global state, cookies, or the Supabase session.

**Rationale:** Explicit parameters make the authorization surface visible at the call site and in TypeScript signatures. They also let the function be exercised by integration tests with arbitrary user ids.

#### Scenario: Updating a user-owned row
- **WHEN** a repository exposes a mutating function for a user-owned table (e.g. `updatePost`, `deleteDraft`, `removeBookmark`, `unsubscribe`)
- **THEN** its TypeScript signature includes a `userId: string` parameter that is forwarded into the SQL filter

### Requirement: SQL-layer ownership filter (R3)

User-scoped mutating repository functions SHALL apply the ownership filter in the SQL query itself — e.g. `.eq('created_by', userId)` or `.eq('user_id', userId)` chained onto the `update`/`delete` call, or equivalent within an RPC. Callers SHALL NOT rely on a prior SELECT-then-act pattern without an SQL-level filter on the write.

**Rationale:** A SELECT-then-act check is a TOCTOU hazard. Putting `.eq('<owner>', userId)` on the UPDATE/DELETE itself means the database refuses to touch a row that doesn't match — even under concurrency.

For DELETE operations where a separate look-up is needed (e.g. to fan out cache invalidation), the function MAY issue a SELECT first, but the DELETE itself (or the RPC it invokes) MUST still be ownership-scoped. `deletePost` is the canonical example: it selects to pre-compute invalidation targets, then delegates to `delete_post_and_promote_mirror`, whose call site is preceded by `.eq('created_by', userId).maybeSingle()` as the authorization gate.

#### Scenario: Owner invokes a mutating function
- **WHEN** a user calls a mutating function with their own `userId` on a row they own
- **THEN** the SQL write applies the ownership filter, the row is mutated, and the function returns the updated entity or `true`

#### Scenario: Non-owner invokes a mutating function
- **WHEN** a user calls a mutating function with a `userId` that does not match the row's owner column
- **THEN** the SQL write's `WHERE` clause matches zero rows, the underlying row is not modified, and the function returns `null` (for `update*`) or `false` (for `delete*`)

#### Scenario: Mutating function called with a non-existent row id
- **WHEN** a user calls a mutating function with an `id` that does not exist
- **THEN** the function returns `null` or `false` — indistinguishable from the "exists but not yours" case — so the API layer surfaces a uniform 404 and does not leak existence of other users' rows

### Requirement: Silent failure return shape (R4)

When a user-scoped mutating function cannot locate a row matching both `id` and `userId`, it SHALL return `null` (for functions returning the entity) or `false` (for functions returning a boolean), and SHALL NOT throw. The API layer's contract is to convert `null`/`false` into a `404 Not Found` response.

**Rationale:** Throwing leaks information. A "forbidden" response tells an attacker that the row exists but they can't touch it; a "not found" response is indistinguishable from a bad id.

#### Scenario: API route handles an ownership miss
- **WHEN** an API route receives `null` or `false` from a mutating repository function
- **THEN** the route responds with HTTP 404 (not 403), matching the shape of a genuinely missing resource

### Requirement: Integration test coverage (R5)

Every user-scoped mutating repository function SHALL have an integration test under `src/infrastructure/repositories/__tests__/<repo>.ownership.integration.test.ts` that proves the ownership filter holds. The test SHALL include at minimum:
- a positive case (owner calls with correct `userId` → success),
- a negative case (a *different* test user's `userId` → `null`/`false` and row unchanged),
- a non-existent-id case (same observable outcome as the negative case).

Tests SHALL use the fixtures in `src/test-utils/supabase-fixtures.ts` (`createTestUser`, `createTestKol`, `createTestPost`, etc.) to create two distinct real users via the Supabase admin auth API, and SHALL be guarded by `describe.skipIf(!hasIntegrationEnv())` so they skip cleanly when `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are unset.

**Rationale:** Unit tests with mocked Supabase clients can only verify that the code *attempts* to apply a filter; they cannot prove the database itself refuses the write. Integration tests against a real (local or CI) Supabase instance close that gap.

#### Scenario: Adding a new user-scoped mutating function
- **WHEN** a developer adds a new mutating function on a user-scoped table
- **THEN** they also add a test case in the corresponding `*.ownership.integration.test.ts` file covering the three cases above, following the `post.ownership.integration.test.ts` template

#### Scenario: Running the integration suite without DB credentials
- **WHEN** `npm run test:integration` is run without `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` in the environment
- **THEN** every ownership suite is reported as skipped (not failed), and the CLI exits 0

### Requirement: System-level mutations are explicitly exempt (R6)

Mutating functions that do not operate in a user's request context (scraper worker updates, AI-pipeline callbacks, scorecard cache refreshes, background migrations) are exempt from R2-R4 but SHALL be documented in-code with a comment or in this spec's exemption list below, so future reviewers can distinguish "intentional system operation" from "missed ownership filter."

**Current exemption list (as of 2026-04-20):**
- `post.repository.ts`: `updatePostAiAnalysis`, `createMirrorPost`
- `kol.repository.ts`: `updateValidationStatus`, `createKolWithValidation`
- `kol-source.repository.ts`: `updateScrapeStatus`, `updateNextCheckAt`
- `scrape-job.repository.ts`: `startScrapeJob`, `updateScrapeJobProgress`, `completeScrapeJob`, `failScrapeJob`, `resetJobToQueued`, `markPermanentlyFailed`
- `scrape-job-item.repository.ts`: `updateScrapeJobItemStage`, `updateScrapeJobItemDownloadProgress`
- `scorecard-cache.repository.ts`: `upsertKolScorecard`, `upsertStockScorecard`
- `volatility-threshold.repository.ts`: `upsertThreshold`
- `win-rate-sample.repository.ts`: `upsertSamples`, `invalidateByPost`, `invalidateByPostStock`, `clearByTicker`

These are invoked by the scraper worker, AI pipeline, or cron jobs — there is no user-facing HTTP route that hits them directly.

#### Scenario: Reviewing a PR that adds a system-level mutation
- **WHEN** a PR adds a mutating function with no `userId` parameter
- **THEN** the reviewer confirms it is only called from worker/pipeline code and the exemption list above is updated in the same PR, OR the reviewer asks for the function to be brought under R2-R4

### Requirement: Known deferred exceptions (R7)

Functions that should be user-scoped but are not yet are tracked here rather than silently ignored. Each entry SHALL name a follow-up change proposal when one exists.

**Current deferred exceptions:**
- `kol-vocabulary.repository.ts::deleteVocabularyTerm(id)` — currently takes no `userId`. The API route (`src/app/api/kols/[id]/vocabulary/route.ts`) requires auth but does not verify that the calling user owns the parent KOL. Bringing this under R2-R4 requires joining through `kols.created_by`, which is a separate change; the existing code has an explicit comment `// Ensure we're not ignoring the KOL id (for future RLS scoping)` marking the intent.

#### Scenario: A deferred exception is resolved
- **WHEN** a follow-up change fixes a deferred exception
- **THEN** the entry above is removed from this list and an ownership integration test is added under `__tests__/` following R5
