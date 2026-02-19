# Code Review Report (Latest)

Date: 2026-02-19
Scope: `src/app/api/**`, selected `src/infrastructure/repositories/**`

## Summary
- Files reviewed: 35+
- Critical issues found (initial): 4
- High issues found (initial): 8
- Issues fixed in this pass: 10 (mostly auth/quota/pagination hardening)
- Remaining high-priority issues: 5

## Fixed In This Pass
- Added auth checks for write endpoints:
  - `src/app/api/kols/route.ts` (POST)
  - `src/app/api/stocks/route.ts` (POST)
  - `src/app/api/kols/[id]/route.ts` (PATCH)
  - `src/app/api/posts/route.ts` (POST now rejects anonymous)
  - `src/app/api/posts/[id]/route.ts` (PATCH/DELETE)
  - `src/app/api/dashboard/route.ts` (GET now requires login)
- Removed AI quota shared-user anti-pattern:
  - `src/app/api/ai/analyze/route.ts`
  - `src/app/api/ai/identify-tickers/route.ts`
  - `src/app/api/ai/extract-arguments/route.ts`
  - `src/app/api/ai/usage/route.ts`
  - all switched from `DEV_USER_ID` to `getCurrentUserId()`
- Added centralized pagination validation helper:
  - `src/app/api/_helpers/pagination.ts`
  - applied to `posts`, `kols`, `stocks`, `drafts`, `bookmarks`, `kols/[id]/posts`, `stocks/[ticker]/posts`
- Hardened upload delete path validation:
  - `src/app/api/upload/route.ts`
  - blocks path traversal-like values before storage deletion

## Remaining Findings

### [Critical] AI quota update race condition
- Location: `src/infrastructure/repositories/ai-usage.repository.ts`
- Severity: Critical
- Category: Data Consistency / Concurrency
- Problem: `consumeAiQuota()` uses read-then-write pattern; concurrent requests can overspend quota.
- Impact: quota correctness can break under concurrent AI requests.
- Recommendation: move to atomic DB operation (`rpc`/single SQL update with guard), or transaction row lock.

### [High] Post ownership authorization gap
- Location: `src/app/api/posts/[id]/route.ts`, `src/infrastructure/repositories/post.repository.ts`
- Severity: High
- Category: Security / Authorization
- Problem: endpoint now checks login, but does not enforce record ownership (`created_by`).
- Impact: any logged-in user may edit/delete others' posts if ID is known.
- Recommendation: enforce `created_by = userId` in update/delete path (or strict RLS + scoped client).

### [High] Multi-step post creation is non-transactional
- Location: `src/infrastructure/repositories/post.repository.ts`
- Severity: High
- Category: Data Consistency
- Problem: create post, insert `post_stocks`, create arguments, update summaries are separate operations.
- Impact: partial writes when mid-flow failure occurs.
- Recommendation: wrap with transaction/RPC; make operation atomic.

### [Medium] Error response shape still inconsistent
- Location: multiple API routes
- Severity: Medium
- Category: API Consistency
- Problem: both `{ error: string }` and `{ error: { code, message } }` are used.
- Impact: frontend handling complexity and inconsistent DX.
- Recommendation: unify to one schema (prefer `{ error: { code, message } }`) and central helper.

### [Medium] Input schemas still rely on `as` casting in multiple routes
- Location: multiple API routes (`request.json() as ...`)
- Severity: Medium
- Category: Type Safety / Validation
- Problem: runtime payload shape is not strongly validated.
- Impact: runtime exceptions, weaker API contracts.
- Recommendation: use Zod schemas per route and parse before business logic.

### [Medium] Bookmark add still has check-then-insert race
- Location: `src/infrastructure/repositories/bookmark.repository.ts`
- Severity: Medium
- Category: Concurrency
- Problem: pre-check and insert are non-atomic.
- Impact: duplicate insert conflicts under concurrency.
- Recommendation: use upsert / `on conflict do nothing` semantics.

## Validation Run
- `npm run type-check` passed after all edits.

## Suggested Next Batch (Priority Order)
1. Atomic quota consumption in `ai-usage.repository`
2. Post ownership enforcement in update/delete
3. Transactional post create flow
4. Unified API error helper + migration of routes
5. Zod schemas for high-traffic endpoints (`quick-input`, `posts`, `drafts`, `bookmarks`)
