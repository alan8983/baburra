# Claude Follow-up Prompts (from latest review)

## Prompt 1 - Atomic AI quota consumption (critical)
Please refactor `src/infrastructure/repositories/ai-usage.repository.ts` so `consumeAiQuota(userId)` is atomic under concurrent requests.

Requirements:
- No read-then-write race condition.
- Prefer a single SQL/RPC update.
- Preserve existing return shape (`AiUsageInfo`).
- Add/adjust tests for concurrent calls.
- Keep behavior for weekly reset logic.

Deliverables:
- Code changes
- Brief migration note if DB function is required
- Test evidence

---

## Prompt 2 - Enforce post ownership authorization
Please harden post update/delete authorization.

Scope:
- `src/app/api/posts/[id]/route.ts`
- `src/infrastructure/repositories/post.repository.ts`

Requirements:
- Only post creator can PATCH/DELETE.
- Return 403 for authenticated-but-forbidden.
- Keep 401 for unauthenticated.
- Avoid leaking extra details in errors.

Deliverables:
- Implementation
- Any required repository signature changes
- Backward compatibility notes

---

## Prompt 3 - Transactional post creation flow
Please make `createPost()` in `src/infrastructure/repositories/post.repository.ts` transactional.

Current issue:
- post insert, post_stocks insert, argument insert, summary update are split and may partially fail.

Requirements:
- Ensure all-or-nothing behavior.
- Keep current API response contract.
- If using DB-side function, include migration SQL.

Deliverables:
- Refactored repository flow
- Migration file (if needed)
- Failure-case test suggestions

---

## Prompt 4 - Standardize API error response format
Please introduce a shared API error helper and migrate key routes to consistent error shape:
`{ error: { code: string, message: string } }`.

Priority routes:
- `src/app/api/posts/route.ts`
- `src/app/api/drafts/route.ts`
- `src/app/api/bookmarks/route.ts`
- `src/app/api/kols/route.ts`
- `src/app/api/stocks/route.ts`

Requirements:
- Minimal churn, clear error codes.
- Keep status codes unchanged unless incorrect.
- Update any affected frontend parsing.

Deliverables:
- Shared helper
- Route migrations
- Quick compatibility notes

---

## Prompt 5 - Add Zod request validation to core routes
Please replace unsafe `request.json() as ...` with Zod validation for these routes:
- `src/app/api/quick-input/route.ts`
- `src/app/api/posts/route.ts`
- `src/app/api/drafts/route.ts`
- `src/app/api/bookmarks/route.ts`

Requirements:
- Return 400 with structured error payload.
- Keep existing business logic intact.
- Validate boundaries (length/range) explicitly.

Deliverables:
- Zod schemas (shared where useful)
- Route updates
- Short summary of rejected payload examples
