# Code Review Report (Latest Full Re-Review)

Date: 2026-02-19  
Scope: Full codebase (`src/app`, `src/components`, `src/hooks`, `src/app/api`, `src/infrastructure/repositories`, `src/domain/services`)

## Baseline Check
- `npm run type-check`: passed
- `npm run lint`: passed with 3 warnings (`tests/e2e/quick-input.spec.ts` unused eslint-disable)
- `npm test`: passed (12 files, 348 tests)
- Working tree currently has active changes in app/components/tests files; this report reviews latest state without reverting any user changes.

## Summary
- Files reviewed: full project scope (focused deep review on API/repository/frontend hotspots)
- Critical issues: 1
- High issues: 5
- Medium issues: 8
- Low issues: 3

## Critical Issues

### [Critical] AI quota fallback path is still non-atomic
- Location: `src/infrastructure/repositories/ai-usage.repository.ts`
- Problem: `consumeAiQuota()` is atomic only when RPC exists. Fallback path still does read-then-update and can overspend quota under concurrent calls.
- Impact: quota integrity can break during contention.
- Recommendation: remove fallback for production path (fail hard if RPC missing) or implement guarded atomic SQL update in fallback.

## High Priority Issues

### [High] Post creation flow is not truly transactional
- Location: `src/infrastructure/repositories/post.repository.ts`
- Problem: `createPost()` performs multi-step writes with compensating deletes. Compensation itself can fail and is not equivalent to DB transaction guarantees.
- Impact: partial writes / data drift in exceptional paths.
- Recommendation: move to DB transaction via RPC/stored procedure for post + post_stocks + post_arguments.

### [High] KOL update endpoint lacks ownership/role authorization
- Location: `src/app/api/kols/[id]/route.ts`, `src/infrastructure/repositories/kol.repository.ts`
- Problem: endpoint checks login but not owner/admin permission.
- Impact: any logged-in user can modify any KOL record.
- Recommendation: enforce ownership/admin policy at API/repository level (or explicit product decision with audit trail).

### [High] Batch import pipeline is non-transactional across critical steps
- Location: `src/domain/services/import-pipeline.service.ts`
- Problem: URL import does quota consume, extract, KOL/stock create, argument extraction, post create as independent operations.
- Impact: partial success states are possible and hard to reconcile.
- Recommendation: treat each URL as a transactional unit (RPC + retry/compensation strategy).

### [High] Error contract remains inconsistent across APIs
- Location: multiple routes in `src/app/api/**` and helper `src/lib/api/error.ts`
- Problem: mixed formats `{ error: string }` vs `{ error: { code, message } }`; `internalError()` returns string payload.
- Impact: frontend error parsing complexity and inconsistent client behavior.
- Recommendation: standardize all errors to structured schema and migrate `internalError()` accordingly.

### [High] Hooks/components still lack unit tests
- Location: `src/hooks/**`, `src/components/**`, `src/app/**`
- Problem: no test files found for hooks/components/pages despite heavy business UI logic.
- Impact: regressions in query behavior and UX states are likely.
- Recommendation: add tests for top risk paths (`usePosts`, `useBookmarks`, selector components, chart rendering/error states).

## Medium Priority Issues

### [Medium] Unsafe request casting persists in key routes
- Location: `src/app/api/quick-input/route.ts`, `src/app/api/drafts/route.ts`, `src/app/api/drafts/[id]/route.ts`, `src/app/api/profile/route.ts`, `src/app/api/ai/*`
- Problem: multiple routes still use `request.json() as ...` without schema parse.
- Recommendation: adopt shared Zod schemas + `parseBody()` consistently.

### [Medium] `parseBody()` and error helper return string-only errors
- Location: `src/lib/api/validation.ts`, `src/lib/api/error.ts`
- Problem: validation and internal errors are not aligned to structured error contract.
- Recommendation: return `{ error: { code, message, details? } }` from both helpers.

### [Medium] N+1 style query cost in KOL/Stock repositories
- Location: `src/infrastructure/repositories/kol.repository.ts`, `src/infrastructure/repositories/stock.repository.ts`
- Problem: stats are assembled using multiple queries + in-memory grouping.
- Recommendation: switch to aggregated SQL/RPC views for count + latest date.

### [Medium] Sequential AI argument extraction in `/ai/extract-arguments`
- Location: `src/app/api/ai/extract-arguments/route.ts`
- Problem: per-stock extraction runs sequentially; latency scales linearly with stock count.
- Recommendation: use bounded parallelism (`Promise.allSettled` + concurrency limit).

### [Medium] Chart component re-creates heavy chart too often
- Location: `src/components/charts/sentiment-line-chart.tsx`
- Problem: chart effect depends on `t`, `sentimentMarkerHex`, handler refs; may trigger full chart re-init frequently.
- Recommendation: reduce effect deps and isolate data/locale updates from chart init path.

### [Medium] Inconsistent user-facing error semantics on post detail page
- Location: `src/app/(app)/posts/[id]/page.tsx`
- Problem: load-failure path uses `detail.priceError` message for general detail fetch failure.
- Recommendation: split translation keys for fetch failure vs chart/price failure.

### [Medium] Generic frontend fetch errors lose backend context
- Location: `src/hooks/use-posts.ts`, `src/hooks/use-kols.ts`, `src/hooks/use-stocks.ts`, `src/hooks/use-bookmarks.ts`
- Problem: hooks throw static `Error('Failed to ...')` without reading structured server error.
- Recommendation: parse error payload and propagate `status/code/message`.

### [Medium] Upload validation checks MIME/type but not file signature
- Location: `src/app/api/upload/route.ts`
- Problem: relies on client-provided MIME and extension semantics.
- Recommendation: validate binary signature (`magic number`) before upload.

## Low Priority Issues

### [Low] Dev-mode internal error detail exposure policy should be explicit
- Location: `src/lib/api/error.ts`
- Problem: returns raw error detail in non-production.
- Recommendation: keep but document policy, or gate with safe allowlist even in dev.

### [Low] `kol-selector` keyboard clear handler uses double cast
- Location: `src/components/forms/kol-selector.tsx`
- Problem: `as unknown as React.MouseEvent` weakens type safety.
- Recommendation: unify handler signatures for mouse/keyboard events.

### [Low] E2E lint warnings pending cleanup
- Location: `tests/e2e/quick-input.spec.ts`
- Problem: unused eslint-disable directives.
- Recommendation: remove stale directives or restore intended rule scope.

## Already Improved Since Previous Review
- Post update/delete ownership gate now enforced (`updatePost(id, userId, ...)`, `deletePost(id, userId)`).
- Bookmark insertion race mitigated via `upsert` with conflict key.
- AI routes switched to per-user quota consumption flow.
- Pagination guard helper centralized and reused.

## Priority Fix Queue (Recommended)
1. Make AI quota consume path strictly atomic (remove unsafe fallback semantics).
2. Make post creation/import flows transactional per request unit.
3. Enforce KOL authorization policy (owner/admin) for PATCH.
4. Standardize API error contract and helper implementations.
5. Roll out Zod validation to remaining high-traffic routes.
6. Add hook/component tests for critical user flows.
