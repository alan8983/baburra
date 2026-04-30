## Why

The KOL detail page (`/kols/[id]`) header — implemented as `KolScorecard` — became visually messy after the recent commit `b641ffd` ("directional hit rate ring + σ-band histogram + inline advanced metrics") inlined the σ-derived advanced metrics that previously lived behind a popover. The right side of the card now carries **nine** concurrent display elements (period selector, win-rate ring, sigma-band histogram, sample-size + significance hint, advanced-metrics block with five rows, 4-period returns grid, per-stock chips). All of this competes for attention next to the avatar/identity column on the left.

A second, related issue: the same card renders one `<SubscriptionToggle>` per `kol_sources` row. For multi-source KOLs (e.g., **Gooaye 股癌** with both a Podcast feed and a YouTube channel), the user sees two visually identical "追蹤" buttons stacked under the avatar with no platform context — they look like a duplicate render bug. They are not — each toggles a different `(userId, sourceId)` subscription — but the UX leaks an internal abstraction (sources) that users do not need to think about. The previous mental model was wrong: a user who follows "Gooaye 股癌" is following the KOL, not specifically the Podcast or specifically the YouTube channel.

The header is the most-viewed element on the most-viewed page in the product. Its information architecture should put identity first, the headline metric second, and the dense σ-frame analytics third — not all at the same level.

## What Changes

- **Three-row header layout** replaces today's two-column composition:
  - **Row 1 — Identity strip**: avatar (60×60 instead of 80×80 to fit horizontally), name, bio, post-count + follower badges, navigation icons (one per `kol_source.platformUrl`, deduped against `kol.socialLinks`), and the consolidated 追蹤 button — all on a single horizontal line that wraps on narrow widths.
  - **Row 2 — Headline metric**: period selector + WinRateRing + SigmaBandHistogram + sample-size/significance hints + 4-period returns grid. Same components used today, just regrouped onto one row dedicated to "is this KOL good?"
  - **Row 3 — Drilldown disclosure**: a collapsible section containing today's `ScorecardAdvancedMetrics` block and the per-stock breakdown chips. **Collapsed by default**.
- **Drilldown collapse state persists per-user** via `localStorage` under the key `kols.detail.drilldown.expanded`. Power users who always want the advanced metrics open get one toggle and they stay open across navigations on the same device.
- **Consolidated KOL-level 追蹤 button** replaces the per-source `SubscriptionToggle` buttons:
  - Visible label: 追蹤 (follow) / 追蹤中 (following) — a single Sonner toast notification fires on each successful subscribe / unsubscribe.
  - "追蹤中" state is shown if-and-only-if the user is subscribed to **every** source of the KOL. Otherwise the button shows 追蹤. Partial-subscription users (already subscribed to some-but-not-all sources of a KOL under the old per-source UI) see 追蹤; clicking it subscribes them to the missing sources.
  - Clicking "追蹤" subscribes to all unsubscribed sources for the KOL (parallel `(userId, sourceId)` mutations under the existing API). Clicking "追蹤中" unsubscribes from all subscribed sources.
  - Backend schema is **unchanged**: `subscriptions(user_id, source_id)` rows still drive the system. The fan-out is a frontend concern.
  - Tier-limit math (per-source counting) is **unchanged in this change**. Defer to [#103](https://github.com/alan8983/baburra/issues/103) — that's a billing/tier rework, not a UI rework.
- **Platform-icon navigation links** rendered separately from the subscribe button. Each `kol_sources.platformUrl` becomes a clickable icon (using the existing `getPlatformIconByName` helper from `src/components/ui/platform-icons.tsx`) that opens the URL in a new tab. The existing `kol.socialLinks` row collapses into the same icon row, with URLs deduplicated so a Twitter handle that also appears in `socialLinks` isn't shown twice.

### Out of scope

- The "1 KOL = 1 tier-limit slot" rework. Tracked in [#103](https://github.com/alan8983/baburra/issues/103). Until that lands, following Gooaye 股癌 will continue to consume 2 of the user's `kolTracking` slots (one per source).
- The `SubscriptionToggle` component file itself. After this change it has zero call sites; deletion is a separate cleanup commit so the structural change can roll back independently if needed.
- Any migration of existing `subscriptions` rows. Existing partial-subscription users keep their rows; the consolidated button just shows them 追蹤 (instead of "follow this remaining source") and clicking subscribes them to the missing ones.
- Per-period customisation, dashboards, or any rework of the per-stock sections below the header. Those continue to render as today.
- Visual regression tests for the new layout. Manual preview verification only.
- Changes to the underlying win-rate, scorecard cache, or aggregator code. The components consumed by Row 2 (`WinRateRing`, `SigmaBandHistogram`, `ScorecardAdvancedMetrics`, `PeriodSelector`, `InsufficientDataBadge`) and Row 3 (`ScorecardAdvancedMetrics`, per-stock chips) are reused unchanged.

## Capabilities

### New Capabilities

- `kol-detail-presentation`: header-row layout, drilldown disclosure persistence, consolidated subscribe semantics, and platform-icon link rendering. Documents the user-facing contract for the KOL detail page header so future changes know which behaviours are intentional.

### Modified Capabilities

None. No existing spec describes the KOL detail page UI.

## Impact

- **Code**:
  - `src/app/(app)/kols/[id]/_components/kol-scorecard.tsx` — restructure from two-column flex to three rows. Add `<KolFollowButton>` and the platform-icon link strip to Row 1. Move `ScorecardAdvancedMetrics` and per-stock chips into a `<KolDrilldown>` collapsible component for Row 3. Reuse `WinRateRing`, `SigmaBandHistogram`, `PeriodSelector`, `InsufficientDataBadge`, and the 4-period grid in Row 2 unchanged.
  - `src/app/(app)/kols/[id]/_components/kol-follow-button.tsx` (new) — the consolidated KOL-level subscribe button. Owns the fan-out logic over `kol_sources`, the partial-vs-full state derivation, the toast feedback wiring, and the `TrackingLimitGate` interaction.
  - `src/app/(app)/kols/[id]/_components/kol-drilldown.tsx` (new) — the Row 3 collapsible. Owns the localStorage-persisted expanded/collapsed state. Renders `ScorecardAdvancedMetrics` and the per-stock chip strip as its body content.
  - `src/app/(app)/kols/[id]/_components/kol-platform-links.tsx` (new) — renders the deduplicated platform-icon link row from `kol_sources` and `kol.socialLinks`. Reuses `getPlatformIconByName` / `getPlatformIconByUrl` from `src/components/ui/platform-icons.tsx`.
  - `src/hooks/use-drilldown-expanded.ts` (new) — `useDrilldownExpanded()` reads/writes `kols.detail.drilldown.expanded` in `localStorage`, falls back to `false` (collapsed). SSR-safe initial render. Same shape as the chart-mode preference hook from `posts-detail-ui-rework`.
  - `src/components/kol/subscription-toggle.tsx` — **no consumer after this change**. The file stays in place; deletion is a follow-up commit so we can roll back the wiring without losing the component.
  - `src/messages/{zh-TW,en}/kols.json` and `subscriptions.json` — new keys for the drilldown disclosure label, the consolidated-button "follow all" / "following all" copy, and the toast messages. The existing `subscriptions.follow` and `subscriptions.following` keys remain unchanged (still used by other pages if any pop up later).
- **No DB / API / migration changes.** All backend code unchanged. Frontend fans out over the existing `(userId, sourceId)` mutations.
- **Tests**:
  - Existing component tests under `src/app/(app)/kols/[id]/_components/__tests__/` should continue to pass — they cover `kol-stock-section.test.tsx` and `page-pagination.test.tsx`, neither touched by this change.
  - No new unit tests for the new layout components per project precedent (thin composition over already-tested primitives — see `redesign-scorecard-with-directional-ring-and-histogram` task §10 deferral notes).
- **i18n**: ~6 new keys per locale. No renames.
- **Bundle size**: no new dependencies. The drilldown disclosure is a custom state-driven show/hide (Chevron toggle + conditional render), avoiding `@radix-ui/react-collapsible` which is not currently in the bundle.
