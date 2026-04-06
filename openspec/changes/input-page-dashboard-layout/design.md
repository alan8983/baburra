## Context

`/input` currently stacks three blocks vertically: the wizard stepper, the smart-input card (heading + textarea + detection affordances + primary action), and `<RecentScrapeJobs />`. On wide screens the right half of the viewport is empty whitespace. The user wireframe reclaims that space as a persistent right rail with three navigation cards, turning `/input` into a lightweight landing hub.

Existing building blocks we can lean on:
- `useKols()` and `useStocks()` React Query hooks already fetch full lists with `created_at` on each row.
- `ROUTES.DASHBOARD`, `ROUTES.KOLS`, `ROUTES.STOCKS`, `ROUTES.kolDetail(id)`, `ROUTES.stockDetail(id)` are already defined in `src/lib/constants/routes.ts`.
- shadcn `Card`, `Badge`, and `next/link` cover all new UI primitives.

## Goals / Non-Goals

**Goals:**
- Two-column layout at `lg` and above; single column below.
- Right rail surfaces 3 nav cards; KOLs/Stocks cards show the 3 most recently added items as chips that link to detail pages.
- Reuse existing data hooks; no new API routes.
- Graceful empty / loading states (skeleton chips, empty-state copy).
- Preserve all existing smart-input behaviour (wizard, detection, recent jobs).

**Non-Goals:**
- Changing wizard logic, detection ordering, or scrape flows.
- Adding a new backend `/api/recent` endpoint.
- Updating E2E tests (follow-up change).
- Touching sidebar navigation or `/scrape` redirect.

## Decisions

**Decision 1 — Layout primitive: CSS grid over flex.**
Use a Tailwind `grid grid-cols-1 lg:grid-cols-3 gap-6` wrapper with the main column spanning `lg:col-span-2` and the right rail `lg:col-span-1`. Grid keeps row heights independent (main column can grow with recent-jobs list without stretching the right rail).
_Alternative_: flex with `flex-wrap`. Rejected — harder to enforce the 2/3 : 1/3 split responsively.

**Decision 2 — New component `InputPageQuickNav` in `src/components/input/`.**
Keeps `page.tsx` composition-only and makes the rail testable in isolation. Component internally calls `useKols()` / `useStocks()` so `page.tsx` does not need to thread data down.
_Alternative_: inline JSX in `page.tsx`. Rejected — page.tsx is already ~200 lines of wizard state machine.

**Decision 3 — Client-side sort + slice for "most recent" chips.**
`useKols` and `useStocks` return full lists. Sort by `createdAt` desc and take `.slice(0, 3)` inside `InputPageQuickNav`. For typical users (< 100 KOLs/stocks) this is trivial work.
_Alternative_: add a `?sort=recent&limit=3` query param to the hooks / API. Rejected — unnecessary complexity for a view with already-cached data.

**Decision 4 — Card-level link for Dashboard card; header + chip links for KOLs/Stocks cards.**
Dashboard card has no inner interactive content, so the entire card is an `<a>`/`<Link>` with hover styles. KOLs/Stocks cards have interactive chips, so only the header/title is a link (avoids nested interactive elements breaking a11y).

**Decision 5 — i18n keys under `input.quickNav.*`.**
Avoid polluting the shared `common.json`. Structure:
```
quickNav.dashboard.title / description
quickNav.kols.title / description / empty
quickNav.stocks.title / description / empty
```

**Decision 6 — Empty / loading states.**
- Loading: render 3 skeleton chips (`<Skeleton className="h-6 w-16" />`).
- Empty (0 items): render the card with descriptive text and an empty-state hint, no chips. Header still links to the list page.

## Risks / Trade-offs

- **[Risk]** `useKols()` / `useStocks()` fetch the full list, which could be large for power users → **Mitigation**: these hooks are already used by `/kols` and `/stocks` list pages, so the cache is warm for most navigation paths. No regression vs. status quo.
- **[Risk]** Nested interactive elements if we make the whole KOLs card a link with chips inside → **Mitigation**: only header-link pattern on KOLs/Stocks cards (Decision 4).
- **[Risk]** Wireframe shows chips as rounded pills; shadcn `Badge` is a good match, but we need them to be clickable links → **Mitigation**: wrap `Badge` in `<Link>` and add hover styles.
- **[Trade-off]** Two-column layout below `lg` would be cramped on tablet (768–1024px). Accepting single-column at that width keeps the smart input spacious on tablets; power users on `lg+` get the dashboard experience.
