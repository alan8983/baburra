# Validation: Limit per-stock posts on KOL detail

Final gatekeeper before merge. All Tier 1 + Tier 2 checks must pass.

## Test KOLs

| ID | KOL | KOL ID | Why |
|----|-----|--------|-----|
| K1 | Gooaye 股癌 | `b7a958c4-f9f4-48e1-8dbf-a8966bf1484e` | High-volume KOL (40 posts, NVDA has ~18) — exercises the `> 3` threshold. |
| K2 | Any KOL with ≤ 3 posts on every stock | Pick from `SELECT kol_id, stock_id, COUNT(*) FROM posts JOIN post_stocks ... GROUP BY kol_id, stock_id HAVING COUNT(*) <= 3 LIMIT 1` | Exercises the ≤ 3 "no button" path. |

**Auth:** Use `DEV_USER_ID` locally to skip login. On a preview deployment, log in with the shared dev account.

**Dev server:** Start via `preview_start` with `next-dev` from `.claude/launch.json` (spawns on port 3000).

---

## Tier 1 — Smoke Test (run after code is complete)

### T1.1: Type check + unit tests + lint

```bash
npm run type-check
npm run lint
npm test -- src/app/\(app\)/kols/\[id\]/_components/__tests__/kol-stock-section.test.tsx
```

**Pass criteria:** All green. The new test file passes all 7 cases in tasks §7.2.

### T1.2: Production build succeeds

```bash
npm run build
```

**Pass criteria:** Exit code 0. No "missing segment" or "hook used outside a client component" errors. Confirms the new `/kols/[id]/stocks/[ticker]` route is registered.

---

## Tier 2 — Browser MCP E2E (run after Tier 1 passes)

### T2.1: KOL with many posts — button appears, redirects correctly

```
Browser MCP Steps:
──────────────────
1. preview_start({ name: "next-dev" })  # or reuse existing
2. navigate("http://localhost:3000/kols/b7a958c4-f9f4-48e1-8dbf-a8966bf1484e")
3. Wait for page to render (Gooaye scorecard ring visible, stock sections rendered)
4. Scroll to the NVDA stock section
5. ASSERT: exactly 3 post cards render under "勝率分析的文章" / "Posts" card
   - Selector: `[data-stock-ticker="NVDA"] [data-testid="stock-post-card"]`
     (if data-testid is not set, use the post card class + role=button)
6. ASSERT: a "查看全部 {N} 篇文章" button renders immediately below the 3 posts,
   where N is the total post count for this (Gooaye, NVDA) pair (expect ≥ 4).
7. ASSERT: the 3 visible posts are in DESC order by posted_at (earliest date at bottom).
   - Extract the date text from each card; verify monotonically non-increasing.
8. click(the "View all" button)
9. ASSERT: URL is now `/kols/b7a958c4-f9f4-48e1-8dbf-a8966bf1484e/stocks/NVDA`.
10. Wait for the new page to render.
11. ASSERT: the page shows more than 3 post cards (the full list) —
    count should match the N shown in the button label on the previous page.
12. ASSERT: back link labeled "返回 Gooaye 股癌" / "Back to Gooaye 股癌" visible near the top.
13. click(back link)
14. ASSERT: URL is back to `/kols/b7a958c4-...`.
15. Screenshot the KOL page after return (verify scroll position preserved or at top).
```

**Pass criteria:** Every ASSERT above passes. No console errors. No 500s in network panel.

### T2.2: KOL with ≤ 3 posts per stock — no button

```
Browser MCP Steps:
──────────────────
1. Pick a (KOL, stock) pair where COUNT(posts) <= 3.
   Recommended: new test KOL with 2 posts about the same stock —
   create via seed if no such pair exists in prod/dev DB.
2. navigate("http://localhost:3000/kols/<low-volume-kol-id>")
3. Locate the target stock's section.
4. ASSERT: all posts (1, 2, or 3) are rendered — none elided.
5. ASSERT: NO "Show more" / "查看全部" button under the post list.
6. ASSERT: no empty/whitespace placeholder where the button would be
   (visual regression: bottom padding of the card should match the
    existing ≤ 3 case).
```

**Pass criteria:** No button rendered. No visual regression.

### T2.3: New page — direct URL, cold cache

```
Browser MCP Steps:
──────────────────
1. Open a fresh incognito window (or clear React Query cache).
2. navigate("http://localhost:3000/kols/b7a958c4-f9f4-48e1-8dbf-a8966bf1484e/stocks/NVDA")
   — this is a direct hit, NO parent-page visit first.
3. ASSERT: loading state renders briefly (skeleton or spinner).
4. ASSERT: within 3 s, page content appears (KOL header, stock header,
   scorecard, full post list).
5. ASSERT: post count matches the DB query
   SELECT COUNT(*) FROM posts p
   JOIN post_stocks ps ON ps.post_id = p.id
   JOIN stocks s ON s.id = ps.stock_id
   WHERE p.kol_id = 'b7a958c4-...' AND s.ticker = 'NVDA';
6. Screenshot the page.
```

**Pass criteria:** Cold direct-URL load works. No hydration errors. Post count matches DB.

### T2.4: Empty-state — valid KOL, ticker with no posts

```
Browser MCP Steps:
──────────────────
1. Pick a valid ticker the target KOL has NEVER posted about (e.g. Gooaye has no PLTR posts — verify with SQL).
2. navigate("http://localhost:3000/kols/<kolId>/stocks/PLTR")
3. ASSERT: KOL header renders (avatar + name visible).
4. ASSERT: empty-state message renders:
   zh-TW: "Gooaye 股癌 尚未發表關於 PLTR 的文章"
   en:    "Gooaye 股癌 hasn't posted about PLTR yet."
5. ASSERT: NO scorecard section, NO chart, NO post list.
6. ASSERT: back link to KOL detail is present and clickable.
```

**Pass criteria:** Empty state copy renders exactly. No crashes, no 500s.

### T2.5: Unknown KOL — 404

```
Browser MCP Steps:
──────────────────
1. navigate("http://localhost:3000/kols/00000000-0000-0000-0000-000000000000/stocks/NVDA")
2. ASSERT: page renders the standard 404 / not-found state (same pattern as
   /kols/<unknown-id> already shows today).
```

**Pass criteria:** 404 rendering matches the existing `/kols/[id]` not-found behavior.

### T2.6: URL-encoded special tickers

```
Browser MCP Steps:
──────────────────
1. Find a KOL with posts about BRK.B or ^TWII (query DB to confirm).
2. On their KOL page, find the BRK.B / ^TWII section.
3. click(the "Show more" button).
4. ASSERT: URL segment is percent-encoded correctly, e.g.
   /kols/<id>/stocks/BRK.B   or   /kols/<id>/stocks/%5ETWII
5. ASSERT: page loads successfully (no 404, no route-parse error).
6. Verify the stock header renders the decoded ticker ("^TWII", not "%5ETWII").
```

**Pass criteria:** Encoding + decoding round-trips correctly.

---

## Tier 3 — Manual polish

Things a human needs to eyeball; not scriptable.

### T3.1: Visual diff on KOL detail page

- Open Gooaye's page before + after the change in two tabs.
- **Before:** each stock card's post list scrolls for 18+ rows.
- **After:** each stock card's post list is capped at 3 + a button.
- Confirm overall page height roughly halves; no layout jitter; button is clearly an action, not noise.

### T3.2: Button label polish

- Verify the zh-TW label reads naturally with a real count: `查看全部 18 篇文章` (not `查看全部 18篇文章` — needs the space).
- Verify en label: `View all 18 posts`.
- Singular edge case: button only appears when count > 3, so plural wording is always safe.

### T3.3: Responsive breakpoints

- At `sm` (640px): the 2-column `lg:grid-cols-2` collapses to 1 column. Button should render under the posts card normally — no overflow, no truncation.
- At `xs` (360px mobile): verify button text doesn't wrap awkwardly.

---

## Failure Modes & Rollback

If any Tier 1 or Tier 2 check fails: revert the PR. No partial rollout — the change is tiny and pure UI.

If only T2.6 fails (special ticker encoding): gate the button behind a `ticker.match(/^[A-Z0-9]+$/)` check and ship without the edge case; open a follow-up.
