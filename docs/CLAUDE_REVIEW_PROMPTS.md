# Claude Follow-up Prompts (latest full re-review)

## Prompt 1 - Make AI quota consume strictly atomic (critical)
Please harden `consumeAiQuota(userId)` in `src/infrastructure/repositories/ai-usage.repository.ts`.

Current risk:
- RPC path is atomic, but fallback path remains read-then-update and can race under concurrency.

Requirements:
- No non-atomic fallback in production path.
- Prefer one DB atomic path (RPC / guarded SQL update).
- Keep current return type (`AiUsageInfo`).
- Add tests for concurrent consumption and quota exhaustion edge cases.

Deliverables:
- Code + migration (if needed)
- Updated tests
- Notes on failure behavior when RPC is unavailable

---

## Prompt 2 - Transactionalize post creation pipeline
Please refactor `createPost()` in `src/infrastructure/repositories/post.repository.ts` to be all-or-nothing.

Current risk:
- Post insert, post_stocks insert, and post_arguments insert are multi-step with compensating deletes.

Requirements:
- Enforce true transactional behavior (DB function/RPC preferred).
- Preserve current API contract and output.
- Remove fragile compensation-only rollback pattern.

Deliverables:
- Refactored repository logic
- SQL migration/RPC if needed
- Failure-path test plan

---

## Prompt 3 - Add authorization policy for KOL updates
Please add explicit authorization rules for `PATCH /api/kols/[id]`.

Scope:
- `src/app/api/kols/[id]/route.ts`
- `src/infrastructure/repositories/kol.repository.ts`

Requirements:
- Decide and implement one rule: creator-only or admin-only (configurable preferred).
- Return 401 for unauthenticated, 403 for unauthorized.
- Keep GET public behavior unchanged.

Deliverables:
- Implementation
- Policy notes in code comments/docs
- Any required schema/repository signature changes

---

## Prompt 4 - Standardize API error contract everywhere
Please unify all API errors to:
`{ error: { code: string, message: string, details?: Record<string, string[]> } }`

Focus files:
- `src/lib/api/error.ts`
- `src/lib/api/validation.ts`
- `src/app/api/**/route.ts` (priority: drafts, quick-input, ai, posts, stocks, kols, upload)

Requirements:
- Keep HTTP status codes correct.
- No plain-string `error` payloads.
- Frontend hooks should parse structured errors consistently.

Deliverables:
- Shared helpers
- Route migrations
- Frontend compatibility update

---

## Prompt 5 - Replace remaining unsafe body casts with Zod
Please remove remaining `request.json() as ...` in high-traffic routes and use shared schema parsing.

Priority routes:
- `src/app/api/quick-input/route.ts`
- `src/app/api/drafts/route.ts`
- `src/app/api/drafts/[id]/route.ts`
- `src/app/api/profile/route.ts`
- `src/app/api/ai/analyze/route.ts`
- `src/app/api/ai/identify-tickers/route.ts`
- `src/app/api/ai/extract-arguments/route.ts`

Requirements:
- Validate lengths/ranges/UUIDs explicitly.
- Return structured 400 payload.
- Preserve existing business logic.

Deliverables:
- Zod schemas + route refactors
- Rejected payload examples

---

## Prompt 6 - Improve frontend resilience and observability
Please improve hooks/component error handling and chart performance hotspots.

Scope:
- `src/hooks/use-posts.ts`, `use-kols.ts`, `use-stocks.ts`, `use-bookmarks.ts`
- `src/components/charts/sentiment-line-chart.tsx`
- `src/app/(app)/posts/[id]/page.tsx`

Requirements:
- Parse server error payload and expose status/code in hooks.
- Avoid unnecessary chart re-creation from unstable dependencies.
- Fix mismatched error message keys (e.g., post detail load using price error copy).

Deliverables:
- Hook-level typed error utilities
- Chart effect dependency optimization
- UX copy/key fixes

---

## Prompt 7 - Add missing tests for hooks/components
Please add a focused test bundle for high-risk client logic.

Priority:
- Hooks: `usePosts`, `useBookmarks`, `useStockPosts`
- Components: `kol-selector`, `stock-selector`, `sentiment-line-chart`

Requirements:
- Cover success + failure + loading states.
- Include at least one mutation failure rollback/assertion case.
- Keep tests stable (mock network and query client).

Deliverables:
- New test files
- Short coverage summary and known remaining gaps
