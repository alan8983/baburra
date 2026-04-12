## Context

`kol-overall-performance-metrics` built the full `PeriodMetrics` shape end-to-end but deliberately scoped UI work out. The existing UI touches four surfaces:

- **KOL Scorecard** (`src/app/(app)/kols/[id]/_components/kol-scorecard.tsx`) — ring + counts, hardcoded day30, reads `winRate` alias
- **Portfolio Pulse** (`src/app/(app)/dashboard/_components/portfolio-pulse.tsx`) — 3-column summary card, day30 only, reads `winRate` alias
- **KOL Leaderboard** (`src/app/(app)/dashboard/_components/kol-leaderboard.tsx`) — top-5 ranked list, sorts by `winRate` alias, no `sufficientData` filter
- **Stock Detail Page** (`src/app/(app)/stocks/[ticker]/page.tsx`) — shows return rates but **does not** consume `useStockWinRate` at all

The dashboard endpoint currently returns pre-picked day30 buckets for both Pulse and Leaderboard. Moving period selection to the client means the endpoint must return all four period buckets per KOL (and the global pulse bucket).

Because Baburra has no launched users (per user confirmation, DB will be reset before launch), we can make breaking changes to the calculator shape, the API responses, and the DB schema in one pass without a deprecation window.

## Goals / Non-Goals

**Goals:**
- Remove the `winRate` alias everywhere, rebind all rings to `hitRate`
- Surface `sqr`, `avgExcessWin`, `avgExcessLose`, `precision` via a discoverable-but-unobtrusive popover
- Enforce the `sufficientData` floor in the leaderboard (filter) and scorecard/pulse (insufficient state)
- Add a period selector to all four consumers, persisted as a user preference (default), not as transient state
- Add a stock-detail win-rate card using the already-shipped `useStockWinRate` hook
- Dual leaderboards (hitRate and SQR) as tabs on the existing card footprint
- Keep the change ship-able in one merge — no partial states

**Non-Goals:**
- Global dashboard-wide period selector (explicitly deferred in favor of local + profile default)
- Pie-chart / sunburst visualization (popover covers the need)
- Per-stock or per-sector breakdown inside the KOL scorecard
- Mobile-specific redesigns
- Changing how `hitRate` / `sqr` are calculated (data layer is already correct)

## Decisions

### D1: Delete the `winRate` alias outright; no two-phase deprecation
**Why:** The parent change kept it for a "one-release deprecation window." We have zero released users, no backwards-compat obligation, and keeping the alias tempts new code to grab the wrong field. The entire purpose of the alias was to let us land the data layer before the UI — we're now landing the UI, so the alias has served its purpose.

**Alternatives:**
- Keep the alias as `@deprecated` through this change — rejected, creates drift risk with nothing gained.
- Rename to `_legacyWinRate` first — rejected, same problem with extra steps.

**Mitigation for risk:** A single grep pass (`grep -rn "\.winRate\b" src`) before merging catches any straggler references.

### D2: Dashboard endpoint returns `WinRateStats` per KOL + per-portfolio, not single buckets
**Why:** Local period selection on the dashboard requires all four periods up front. Alternative (fetch per-period on demand) adds latency and a loading flicker when the user flips tabs.

**Cost:** Dashboard payload grows by ~4×. For a top-100 KOL dashboard at ~80 bytes per bucket, that's ~25KB added → still sub-100KB for the full payload. Acceptable.

**Shape change:**
```ts
// before
interface DashboardData {
  pulseStats: WinRateBucket;         // day30 only
  kolWinRates: { id; name; avatarUrl; bucket: WinRateBucket }[];
}

// after
interface DashboardData {
  pulseStats: WinRateStats;          // all four periods
  kolWinRates: { id; name; avatarUrl; stats: WinRateStats }[];
}
```

### D3: Leaderboard dual view is tabs inside the existing card, not two separate cards
**Why:** Dashboard real estate is tight and the two rankings are the same *data* sorted two ways — tabs communicate "same list, different lens" whereas stacked cards suggest "two independent lists." Option A from the exploration.

**Layout:**
```
┌──────────────────────────────────────┐
│ 🏆 Leaderboard        [5d][30d]...  │
│ [精準度 Accuracy] [信號品質 Signal]  │
│ ──────────────────                   │
│ 1. KOL A    67%   SQR 0.8            │
│ 2. KOL B    62%   SQR 0.6            │
│ 3. KOL C    58%   SQR 1.1            │
└──────────────────────────────────────┘
```
The active tab's metric is bold/large; the inactive metric is small-text hint. Click a tab to swap which metric drives the sort.

**Empty state:** When all KOLs in the filtered list have `sufficientData === false`, show a message: `等更多樣本中… (每位 KOL 至少需要 10 筆可解析貼文) / Gathering more samples… (each KOL needs at least 10 resolved posts)`.

### D4: Filter (not push-to-bottom) for `!sufficientData` in the leaderboard
**Why:** A KOL with `hitRate = null` has no defensible position in a ranking. Sorting them to the bottom still implies "ranked worst." Filtering them out communicates "not measurable yet" honestly.

**Consequence:** New dashboards may show "not enough data yet" for a while — intentional. The scorecard shows the same raw counts so users can still assess individual KOLs on their detail pages.

### D5: Period selection is local state, with user-profile default
**Why:** User explicitly preferred dead-simple local toggles over a global dashboard selector. To cover the "set once, forget it" use case, we add a single profile preference that all components read as their initial value.

**Data flow:**
```
profiles.default_win_rate_period
        │
        ▼
   useProfile() ─────────┐
                         ▼
               <Component>
                useState(profile?.defaultWinRatePeriod ?? '30d')
                         │
                         ▼
                <PeriodSelector>  (local)
                         │
                         ▼
          selects bucket from WinRateStats
```

**Edge case:** Profile loads async. Components render with `'30d'` fallback, then re-render when profile arrives. React's `useState(initial)` pattern plus a `useEffect` that syncs once is sufficient — no flicker because both states render the same bucket shape.

**Alternatives considered:**
- URL query param — rejected, user wanted dead-simple; URL params are the *global* style we explicitly rejected.
- LocalStorage — rejected, loses sync across devices.
- Zustand store — overkill for a single enum.

### D6: Period preference stored as TEXT with CHECK constraint, not an enum type
**Why:** Postgres `CREATE TYPE` migrations are painful to modify later. A `TEXT NOT NULL DEFAULT '30d' CHECK (value IN ('5d','30d','90d','365d'))` column gives us the same validation with easy migration if we ever add a period (e.g., `180d`).

**Column name:** `default_win_rate_period` (snake_case per DB convention). Maps to `defaultWinRatePeriod` in the domain model.

**Validation:** Zod schema in the profile API route mirrors the CHECK constraint; union literal type `'5d' | '30d' | '90d' | '365d'` everywhere in TS.

### D7: Popover (not modal, not tooltip) for the metrics details
**Why:**
- **Tooltip**: dismisses on mouse-leave, not tappable on mobile, can't contain interactive elements.
- **Modal**: too heavyweight for an info disclosure, breaks the page flow.
- **Popover**: opens on click, stays open until dismissed, positioned near its trigger, tappable on mobile, supported by `shadcn/ui` out of the box.

**Trigger:** `ⓘ` icon (Lucide `Info`) next to the ring label. Affords "more info" universally; whole-ring click was considered but deemed less discoverable.

**Content:**
```
┌─────────────────────────────────┐
│ 表現指標 Performance Metrics    │
├─────────────────────────────────┤
│ 精準度 Precision         67.0%  │
│ 信號品質 SQR      0.82 ✓ Decent │
│ 平均超額勝幅 Avg Win    +1.8σ   │
│ 平均超額虧幅 Avg Loss   -1.2σ   │
│ 閾值 Threshold          ±2.3% σ │
│                                 │
│ [小字說明 what SQR means]        │
└─────────────────────────────────┘
```

**SQR qualitative label:** derived in the component from the numeric value — `> 1.0 → ✓ Excellent`, `0.5–1.0 → Decent`, `< 0.5 → ⚠ Unstable`, `null → —`. Thresholds from the parent design doc.

### D8: `<InsufficientDataBadge>` vs. hiding the ring entirely
**Decision:** Render the ring as `"—"` (already supported by `WinRateRing` for null) **and** show the badge below it. Raw counts (wins/noise/loses) still render so the user can see *how close* they are to the floor.

**Why not hide the whole block:** Counts are information. "2 wins, 1 loss, 4 noise, need 10 resolved" is more useful than an empty card.

### D9: Stock detail page uses the same primitives, not a bespoke component
**Why:** `<WinRateRing>`, `<PeriodSelector>`, `<PerformanceMetricsPopover>`, `<InsufficientDataBadge>` are all context-free. Composing them on the stock page means one source of truth for the visual language.

**Placement:** Above the existing return-rate stats, below the main price chart. A horizontal rule separates them.

**Copy:** Uses `useStockWinRate(ticker)`. Header: `KOL 社群對 {ticker} 的預測準確度 / KOL community accuracy on {ticker}`.

### D10: Component file organization
**Placement of shared primitives:**
- `src/components/shared/period-selector.tsx`
- `src/components/shared/performance-metrics-popover.tsx`
- `src/components/shared/insufficient-data-badge.tsx`

These are app-level (not UI-kit) components that consume domain types (`WinRateBucket`, `Period`). They live in `components/shared/` alongside existing cross-cutting components like `price-change-badge.tsx`.

`<WinRateRing>` **stays** at `src/app/(app)/kols/[id]/_components/win-rate-ring.tsx` for now — it's pure presentation, no coupling reason to move it. If the stock page or dashboard ends up importing it, we move it in a follow-up. (Minor debt; noted intentionally.)

## Risks / Trade-offs

- **[Risk]** Deleting the `winRate` alias is a breaking change to the API response shape. **Mitigation:** Single grep sweep before merge; `npm run type-check` catches TypeScript breakage; E2E smoke test on dashboard + KOL detail + stock detail. Pre-launch timing makes the blast radius zero.
- **[Risk]** Local period state means four rings can show four different periods on one dashboard — potentially confusing. **Mitigation:** Profile default anchors everyone to the same starting period; users who toggle one card on purpose are consciously comparing.
- **[Risk]** Dashboard payload grows ~4×. **Mitigation:** Still under 100KB for realistic user sizes; React Query caches on the client so it's a one-time cost per session.
- **[Risk]** Filtering `!sufficientData` KOLs from the leaderboard may leave the board empty in seed/demo states, looking broken. **Mitigation:** Explicit empty-state copy explaining the threshold.
- **[Risk]** Two leaderboard tabs increase cognitive load for new users. **Mitigation:** Accuracy tab is the default (more familiar concept); SQR tab has a one-line explainer in the popover the first time it's opened (or via a small `ⓘ` next to the tab label).
- **[Trade-off]** Popover requires an extra click vs. always-visible metrics. Acceptable — progressive disclosure keeps the ring card uncluttered for casual users while power users get one click to the full picture.
- **[Trade-off]** User preference as DB column (vs. localStorage) means an extra DB round-trip on first page load. Acceptable — profile is already fetched by the layout.

## Migration Plan

Single merge, no feature flag (pre-launch):

1. **DB migration first.** Ship `NNN_add_profile_default_win_rate_period.sql`, apply, regenerate `database.types.ts`.
2. **Data-layer cleanup.** Remove `winRate` alias from calculator, service, API route types, hooks, test fixtures. Type-check gate.
3. **Dashboard endpoint upgrade.** Return `WinRateStats` per KOL + per-portfolio; update `use-dashboard.ts` types.
4. **Shared primitives.** Build `<PeriodSelector>`, `<PerformanceMetricsPopover>`, `<InsufficientDataBadge>`. Unit tests.
5. **Consumer migration (4 surfaces in parallel).**
   - KOL scorecard — period selector + popover + insufficient state
   - Portfolio pulse — period selector + hitRate + SQR sub-label
   - KOL leaderboard — tabs + filter + period selector
   - Stock detail — new card
6. **Settings page.** Default-period select + profile update wiring.
7. **i18n.** Add keys in both locales.
8. **Docs.** `INVARIANTS.md` W1, `win-rate-classification/spec.md`, `BACKLOG.md`.
9. **Validation.** `npm run type-check && npm run lint && npm test && npm run test:e2e`, manual QA on seeded data.

## Open Questions

- **SQR label localization for zh-TW** — `信號品質` is the tab label, but the qualitative markers (`Excellent / Decent / Unstable`) need natural Chinese equivalents. Proposed: `優秀 / 良好 / 不穩定`. Confirm during implementation.
- **Should the metrics popover include a "learn more" link** to a future docs page explaining SQR, hitRate, precision? Design supports it (an empty slot at the bottom). Decision: add the slot but leave the link disabled/hidden until a docs page exists.
- **Period selector visual style** — segmented control (tabs style) vs. chip group. Proposal: segmented control matching `shadcn/ui` `<Tabs>` look, since we're already using Tabs elsewhere on the dashboard after this change.
