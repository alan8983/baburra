## Context

The KOL detail page header (`KolScorecard`) is currently a two-column flex layout with avatar/identity on the left and a tall stack of analytics on the right:

```
┌─ Card ────────────────────────────────────────────────────────────┐
│  ┌─ LEFT (col-1) ──┐  ┌─ RIGHT (lg:flex-1) ───────────────────┐   │
│  │ Avatar (80x80)  │  │  PeriodSelector                       │   │
│  │ Name + bio      │  │  ┌──────┬───────────┐                 │   │
│  │ Post # badge    │  │  │ Ring │ Histogram │                 │   │
│  │ Followers badge │  │  └──────┴───────────┘                 │   │
│  │ Social links    │  │  Sample size + significance + caveat  │   │
│  │ 追蹤 button × N  │  │  ScorecardAdvancedMetrics (5 rows)    │   │
│  │ (one per source)│  │  4-period returns grid (4 cols)       │   │
│  │                 │  │  Per-stock chips                      │   │
│  └─────────────────┘  └───────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

Two compounding problems:

1. **The right column carries nine concurrent display elements** (period selector, ring, histogram, sample-size hint, significance badge, σ caveat, advanced-metrics block, 4-period grid, per-stock chips). The recent inlining of advanced metrics — which used to live in a popover behind a single ⓘ button — surfaced as much information at once as the entire rest of the page combined. The user can read everything at once, but cannot read **anything** at a glance.

2. **The "追蹤" buttons leak the source abstraction**. `kol_sources` is an internal model — a row in `kol_sources` represents one platform feed we scrape from (a YouTube channel, a podcast RSS, a Twitter handle). Users following Gooaye 股癌 don't think "I'm subscribing to the Podcast feed and the YouTube channel" — they think "I'm following Gooaye." The two buttons under the avatar leak the implementation detail and look like a duplicate-render bug.

The fix has four parts:

- Restructure the header into three rows by purpose (identity / headline / drilldown) so each band has a clear job.
- Make the drilldown section collapsible with per-user persistence — power users keep it open, casual users get a clean glance.
- Replace the per-source subscribe buttons with one consolidated KOL-level button (frontend fan-out, no schema change).
- Move platform-context navigation (the URL of each source's profile page) to a separate icon row so users can jump to YouTube / Spotify / X without losing the subscribe affordance.

Backend code, win-rate computation, scorecard cache, and the page below the header are all untouched.

## Goals / Non-Goals

**Goals:**

- The header reads as three distinct bands. Identity first, "is this KOL good?" second, σ-frame analytics third.
- The advanced σ-derived metrics remain available and one click away — they don't return to a popover, but they don't take horizontal space when collapsed either.
- A user clicks one button to follow a KOL, regardless of how many sources that KOL has registered.
- The "I am following this KOL" indicator is unambiguous: 追蹤中 means subscribed to all of the KOL's sources.
- The user gets immediate visual feedback (toast) for every follow / unfollow click.
- The change is purely frontend. No DB migration, no API rework, no scorecard recompute.

**Non-Goals:**

- Reworking the tier-limit math from per-source to per-KOL counting. Tracked in [#103](https://github.com/alan8983/baburra/issues/103). For this change, following Gooaye 股癌 still consumes 2 of the user's `kolTracking` slots.
- Migrating existing `subscriptions` rows. Pre-existing partial subscriptions are fine — clicking the consolidated button just tops up to the full set or unsubscribes everything.
- Storage layer changes (`subscriptions(user_id, source_id)` schema unchanged).
- Adding a "follow only the Podcast" granular control. Users who want one-source granularity will not get it from this UI; the v1 stance is "all or nothing per KOL."
- Replacing `localStorage` with a server-side `profile.kolDrilldownExpanded` column. UI affordance state belongs in `localStorage`; real preferences live in `profile`.
- Mobile-specific reflow beyond the existing card breakpoint behaviour. The three-row layout collapses naturally on narrow viewports.
- Reworking the per-stock sections rendered below the header card. They continue to use `KolStockSection` / `PagePagination` exactly as today.

## Decisions

### D1 — Three-row header structure

The header card body is restructured from `flex-col gap-6 lg:flex-row` to `flex-col gap-4`. Three children, top to bottom:

```
┌─ Card body (flex-col gap-4) ────────────────────────────────┐
│ Row 1 — Identity strip (flex-row flex-wrap items-center) ──│
│   [Avatar 60x60] Name [Bio truncated] [postCount badge]    │
│   [follower badge] [platform icons row]    [追蹤 button]   │
├─────────────────────────────────────────────────────────────┤
│ Row 2 — Headline (flex-col gap-2 sm:flex-row)──────────────│
│   PeriodSelector | Ring + N/M | Histogram | 4-period grid  │
├─────────────────────────────────────────────────────────────┤
│ Row 3 — Drilldown disclosure ─────────────────────────────  │
│  ▶ 進階分析 (Advanced Analytics)  ←  click toggles open      │
│   ┌─ collapsed body (only when expanded) ─────────────────┐ │
│   │ ScorecardAdvancedMetrics (5 rows)                    │ │
│   │ Per-stock breakdown chips                             │ │
│   └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Why three rows, not four (separating Drilldown header from body)?** The disclosure header (`▶ 進階分析`) is *part of* Row 3 — it's a label that becomes a clickable affordance. Treating the header and body as one row keeps the spacing rhythm consistent.

**Why is identity (Row 1) on a single line instead of multi-line as today?** The avatar drops from 80×80 to 60×60 (about 25% smaller area) so the row height matches a typical badge row. Visually denser, but this row stops competing with Row 2 for height. Bio is truncated (`line-clamp-2` on `lg:line-clamp-1`) — full bio is one click away on mobile or via a hover tooltip on desktop.

**Why no left/right split in Row 2?** Today's left column (avatar/identity) doesn't need to be vertically aligned with the analytics — they're different kinds of information. Putting them in distinct horizontal bands makes that explicit. The avatar still anchors the user visually because Row 1 is the first thing they see.

### D2 — Identity row composition

```
[Avatar(60)] [Name (bold)] [Bio (truncated, muted)] · [postCount badge] · [followers badge] | [Platform icons row] | [追蹤 button (right-aligned)]
```

`flex-wrap` ensures the row breaks onto multiple visual lines on narrow viewports. The `追蹤` button stays at the rightmost position via `ml-auto`.

The post-count and follower-count badges are kept (they were already there) but moved inline with the name rather than below it. The bio is truncated to one line on `lg+` and two lines on `md`. On `sm` viewports the bio drops below the avatar/name pair (still on Row 1, just wrapped).

**Why no `gap-y-2` between wrapped lines?** Tailwind `flex-wrap` with `gap-2` provides both row and column gap, so wrapping inherits the same vertical rhythm.

### D3 — Headline row composition

`PeriodSelector`, `WinRateRing`, `SigmaBandHistogram`, sample-size + significance text, and the 4-period grid all already exist as components. Row 2 just inlines them in a horizontal flex layout:

```
[PeriodSelector] [Ring + label + N/M] [Histogram] [4-period grid (4 cells)]
```

On `sm` (`< 640px`) and `md` (`< 1024px`) viewports the row stacks vertically — period selector on top, ring + histogram side-by-side below, 4-period grid full-width at the bottom.

**The 4-period grid moves from inside `BlurGate feature="win_rate_breakdown"` to outside the gate.** Wait — the grid is currently `BlurGate`-wrapped because the per-stock chips are gated. Moving the chips into Row 3 (drilldown) means the gate moves with them; the 4-period grid is no longer gated for free users. This is a deliberate adjustment: the 4-period averages are a headline metric, not a "deep breakdown." If product wants to keep them gated, the gate moves with the grid into Row 2 — to be confirmed in implementation.

The `caveat` text under the ring (`此命中率包含系統推論的關聯標的`) stays under the ring component in Row 2, not Row 3 — it's about the headline number, not about advanced analytics.

**Why keep the histogram in Row 2 and not Row 3?** It's the visual companion to the ring's headline number. The ring shows a single point estimate, the histogram shows the distribution shape — together they tell the headline story. Splitting them weakens the at-a-glance story.

### D4 — Drilldown disclosure pattern (custom, not Radix Collapsible)

`@radix-ui/react-collapsible` is **not** in the project's dependency tree (verified in `package.json` — only `@radix-ui/react-popover` and other primitives are bundled). Adding a new Radix dependency for one disclosure surface is a poor cost/benefit tradeoff. Instead:

```tsx
const [expanded, setExpanded] = useDrilldownExpanded();

<div className="flex flex-col gap-2">
  <button
    type="button"
    onClick={() => setExpanded(!expanded)}
    aria-expanded={expanded}
    aria-controls="kol-drilldown-body"
    className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium"
  >
    <ChevronRight className={cn('h-4 w-4 transition-transform', expanded && 'rotate-90')} />
    {t('detail.drilldown.label')}
  </button>
  {expanded && (
    <div id="kol-drilldown-body" className="space-y-3 pl-5">
      <ScorecardAdvancedMetrics bucket={selectedBucket} className="w-full max-w-md" />
      {perStockRows.length > 0 && <PerStockChipsRow rows={perStockRows} />}
    </div>
  )}
</div>
```

The chevron rotates on `aria-expanded` change for the affordance; the body conditionally renders. No animation library required. Keyboard-accessible (a `<button>`), screen-reader-friendly (`aria-expanded` + `aria-controls`).

**Why not native `<details>`/`<summary>`?** `<details>` does animate the disclosure indicator natively, but the styling is harder to wrangle than a controlled `<button>` (especially the chevron rotation timing, which `<details>` does not transition smoothly). The hand-rolled version is six lines longer and gives full control.

**Why not animate the body height?** A height animation requires either a CSS grid trick or `framer-motion` / `react-aria` collapse — the simplest version (CSS `max-height: 0 → max-height: 1000px`) is jankier than instant render at our content sizes. We'll ship the disclosure without animation; revisit if it feels jarring.

### D5 — Drilldown persistence

Persistence key: `kols.detail.drilldown.expanded`. Values: `'true' | 'false'` (string). Default if not set or invalid: `false` (collapsed).

The `useDrilldownExpanded()` hook mirrors the chart-mode preference hook from the sibling `posts-detail-ui-rework` change:

```ts
export function useDrilldownExpanded(): [boolean, (next: boolean) => void] {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem('kols.detail.drilldown.expanded');
    if (stored === 'true') setExpanded(true);
  }, []);

  const update = useCallback((next: boolean) => {
    setExpanded(next);
    try {
      window.localStorage.setItem('kols.detail.drilldown.expanded', String(next));
    } catch {
      // private mode / quota exceeded — silently ignore
    }
  }, []);

  return [expanded, update];
}
```

**Why the same pattern as `useChartModePreference` instead of factoring a generic `useLocalStorage<T>` helper?** The two hooks are simple and the typing differs (boolean vs union string). A generic helper is a nice-to-have; the cost of the duplication is ~20 lines and the benefit is component-specific clarity.

**Why string `'true'` / `'false'` instead of `'1'` / `'0'` or JSON?** localStorage stores strings. JSON parsing for a boolean is overkill; `'true' | 'false'` is human-readable in DevTools and trivially comparable.

### D6 — Consolidated subscribe button: state derivation and click behaviour

The KOL-level subscribe button is implemented in a new component `KolFollowButton` taking `{ kolId, sources }` where `sources` is the array returned by `useKolSources(kolId)` (each row already carries `id`, `platform`, and `isSubscribed`).

State derivation:

```ts
const allSubscribed = sources.length > 0 && sources.every((s) => s.isSubscribed);
const someSubscribed = sources.some((s) => s.isSubscribed);
const partialState = someSubscribed && !allSubscribed;
```

Visible label:

| State | Button label | Variant |
|---|---|---|
| `sources.length === 0` | (button hidden — no sources to follow) | — |
| `allSubscribed` | `追蹤中` | `secondary` |
| `partialState` | `追蹤` (treats partial as not-following) | `outline` |
| `!someSubscribed` | `追蹤` | `outline` |

**Why "partial = not following" in the label?** Because the affordance "click to subscribe to the missing sources" is conceptually `追蹤` (follow), not `unfollow`. The user sees the button as inviting them to complete the subscription set.

**Why not show a third visual state for partial?** A third variant ("partial" with a half-filled icon, etc.) creates a UX surface that needs onboarding ("what does the half-filled circle mean?"). Treating partial as not-following is a simpler mental model and aligns with the eventual product direction (KOL-level subscriptions, [#103](https://github.com/alan8983/baburra/issues/103)).

Click behaviour:

```ts
const subscribe = useSubscribe();
const unsubscribe = useUnsubscribe();

async function onClick() {
  if (allSubscribed) {
    // Unsubscribe from all sources in parallel.
    await Promise.allSettled(
      sources.map((s) => unsubscribe.mutateAsync({ kolId, sourceId: s.id }))
    );
    toast.success(t('subscriptions.unsubscribedAll'));
  } else {
    // Pre-check tier limit BEFORE firing any mutations.
    const limit = TIER_LIMITS[userTier].kolTracking;
    const missing = sources.filter((s) => !s.isSubscribed);
    if (currentSubscriptionCount + missing.length > limit) {
      setShowLimitDialog(true);
      return;
    }
    await Promise.allSettled(
      missing.map((s) => subscribe.mutateAsync({ kolId, sourceId: s.id }))
    );
    toast.success(t('subscriptions.followedAll'));
  }
}
```

`Promise.allSettled` rather than `Promise.all` because we want the toast to appear even if one of N parallel mutations fails — a single failure shouldn't cancel the rest. After `allSettled`, if any rejected, we show a separate `toast.error('部分操作失敗')` and let the user see the post-mutation state via the React Query invalidation (each successful mutation already invalidates `subscriptionKeys.kolSources(kolId)`).

**Why pre-check tier limit before mutations?** Avoids a half-applied state where 1 of 2 sources subscribes successfully and the second hits the tier limit server-side — leaving the user in `partialState` they didn't intend.

**Why not a confirm dialog when unsubscribing from `partialState` would tear down a previously-explicit single-source subscription?** Considered during grilling; rejected. The toast on success is the safety net (user sees `已取消追蹤` and can re-follow if they didn't intend it). Adding a confirm dialog for the edge case complicates the dominant flow (KOL-level intent users) for a vanishingly small partial-state population. If post-launch we see complaints, the dialog is a one-line addition.

### D7 — Toast feedback wiring

Sonner toast (`import { toast } from 'sonner'`) is already used widely in the project (e.g., `posts/[id]/page.tsx` for delete / re-analyze success/failure). The new button uses the same patterns:

| Action | Toast type | i18n key |
|---|---|---|
| Subscribe success | `toast.success` | `subscriptions.toast.followedAll` (zh-TW: `已追蹤所有來源`) |
| Subscribe error / partial failure | `toast.error` | `subscriptions.toast.followFailed` (zh-TW: `部分追蹤操作失敗`) |
| Unsubscribe success | `toast.success` | `subscriptions.toast.unsubscribedAll` (zh-TW: `已取消追蹤`) |
| Unsubscribe error / partial failure | `toast.error` | `subscriptions.toast.unsubscribeFailed` (zh-TW: `部分取消操作失敗`) |
| Tier limit hit | (existing `TrackingLimitGate` dialog opens; no toast) | — |

Toasts use the default Sonner duration (4 seconds), bottom-right position (the project default). No custom styling.

### D8 — Platform-icon link row

The icon row renders **deduplicated** entries from two sources:

1. `kol_sources` (via `useKolSources(id)`) — each row's `platformUrl` is the canonical source URL we scrape from.
2. `kol.socialLinks` (existing field on `kol`) — auxiliary KOL profile URLs (Twitter, personal website, etc.).

Deduplication strategy: compare URLs after lowercasing and stripping a trailing slash. If the same URL appears in both sets, render once.

```ts
const allLinks = uniqueByUrl([
  ...sources.map((s) => ({ url: s.platformUrl, platform: s.platform })),
  ...Object.entries(kol.socialLinks).map(([platform, url]) => ({ url, platform })),
]);

return (
  <div className="flex flex-wrap items-center gap-1.5">
    {allLinks.map(({ url, platform }) => (
      <a
        key={url}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-foreground"
        aria-label={t('detail.platformLink', { platform })}
      >
        {getPlatformIconByName(platform, 'h-4 w-4')}
      </a>
    ))}
  </div>
);
```

`getPlatformIconByName` returns a `lucide-react` icon (or a project SVG for TikTok/Facebook) coloured per the brand. For unknown platforms (`platform` outside the recognised set), it returns a generic Link icon — forward-compatible.

**Why not text labels on the icons?** Identity row is space-constrained (must fit avatar + name + bio + badges + icons + button). Icons-only with a tooltip on hover (via `aria-label` natively, or wrapping in shadcn `Tooltip` if we want a visible affordance later) is the densest option. Power users recognise the YouTube / Spotify / X icons immediately.

**Why dedup by URL and not by platform?** A KOL might have two YouTube channels — distinct URLs, both valid. Deduping by platform would incorrectly drop one. URL is the natural unique key.

### D9 — Removal path for `SubscriptionToggle`

After this change wiring lands, `SubscriptionToggle` has zero call sites (verified via `grep -r "SubscriptionToggle" src/`). The file is **not deleted in this change** — deletion is staged into a follow-up commit so the structural refactor can roll back without losing the component, and so any imports we missed surface as usage rather than as broken builds.

The follow-up cleanup deletes:

- `src/components/kol/subscription-toggle.tsx`

That's the entire cleanup. There is no test for this component (the project has no tests under `src/components/kol/`).

### D10 — Mobile / responsive behaviour

The three-row structure folds naturally on narrow viewports:

- **`< sm` (≤ 640px)**: Row 1 wraps (avatar | name on one line, bio + badges on next line, platform icons + 追蹤 button on third line). Row 2 stacks (selector → ring/histogram side-by-side or stacked → 4-period grid full-width). Row 3 collapsed by default; when expanded, advanced metrics single-column, chips wrap.
- **`sm` to `md`**: Row 1 fits identity + 追蹤 button on one line; bio truncates. Row 2 horizontal with histogram below ring on `< md`.
- **`md+`**: Row 1 single horizontal line. Row 2 fully horizontal: selector | ring + histogram | 4-period grid. Row 3 inherits.

The existing `KolScorecard` already has reasonable Tailwind breakpoint behaviour for the components reused; we mostly need to add the row-level `flex-col` / `flex-wrap` containers and confirm in preview that nothing collides on `iPhone 14` viewport.

## Risks / Trade-offs

- **Risk**: a partial-subscription user under the old per-source UI now sees `追蹤` instead of `追蹤中` and may interpret it as "the system forgot I follow this KOL." **Mitigation**: small population (only users who deliberately followed one-of-two sources). A click subscribes them to the missing sources — the resulting state matches the new mental model. If we want stronger UX hygiene, a one-time toast on first render could read `已自動為您追蹤所有 X 的來源`, but it's not in the v1 scope.
- **Risk**: `Promise.allSettled` partial failure leaves the user in a `partialState` they didn't intend (e.g., subscribed to YouTube but the Podcast subscribe call 5xx'd). **Mitigation**: the toast.error explicitly mentions partial failure (`部分追蹤操作失敗`), and React Query invalidates the source list so the button re-renders into the correct (partial) state — clicking again completes the subscription. The user is never in a state where the UI lies about their subscription.
- **Risk**: tier-limit pre-check uses `subscriptions.length` (per-source count) until [#103](https://github.com/alan8983/baburra/issues/103) lands. A user near their limit can't follow Gooaye 股癌 (2 sources) even if they had 1 free slot. **Mitigation**: this is the existing behaviour, not new. The `TrackingLimitGate` already explains the limit. [#103](https://github.com/alan8983/baburra/issues/103) is the long-term fix.
- **Trade-off**: the avatar shrinks from 80×80 to 60×60. Some product polish is lost (the 80×80 avatar with a centred bio felt portrait-ish). Acceptable trade for a clean horizontal identity strip.
- **Trade-off**: the 4-period grid moves out of `BlurGate feature="win_rate_breakdown"` to be visible to free users. This is technically a paywall relaxation — flagged for product to confirm during implementation. If the answer is "no, keep gated," the gate moves with the grid into Row 2 unchanged.
- **Trade-off**: instant-show drilldown body without animation can feel a touch jarring on first expansion. We accept this for v1 to avoid pulling in a new animation dependency. Revisit only if user feedback flags it.

## Migration Plan

This change is a single user-visible release. No data migration. Suggested commit order to keep each step reviewable:

1. **Add the drilldown-expanded preference hook** (`src/hooks/use-drilldown-expanded.ts`). Trivially passes type-check.
2. **Add the `KolPlatformLinks` component** (`kol-platform-links.tsx`). Renders the deduped icon row; pure presentation, no state. Verify in preview by temporarily inserting it into the existing layout.
3. **Add the `KolFollowButton` component** (`kol-follow-button.tsx`). Owns the subscribe fan-out, partial-state derivation, toast wiring, and `TrackingLimitGate`. Preview by temporarily replacing one `<SubscriptionToggle>` with the new button. Manually exercise: subscribe→unsubscribe cycle on a multi-source KOL (Gooaye 股癌); confirm toast fires; confirm React Query invalidation produces correct post-state.
4. **Add the `KolDrilldown` component** (`kol-drilldown.tsx`). Owns the disclosure state via the new hook. Preview by temporarily wrapping the existing `ScorecardAdvancedMetrics` block.
5. **Wire `kol-scorecard.tsx`**: replace the existing two-column layout with the three-row structure. Compose Row 1 from the new components, reuse the existing scorecard pieces in Row 2, and delegate Row 3 to `KolDrilldown`. Delete the orphan SubscriptionToggle render and the `kol.socialLinks` text-link row.
6. **i18n**: add new keys in zh-TW and en in the same commit as the wiring.
7. **Manual QA in the preview tool**:
   - Three-row layout renders cleanly on `lg`, `md`, `sm`, and `iPhone 14` viewports with no overflow.
   - Drilldown collapsed by default on first visit; toggle opens it; reload preserves state. Set the localStorage value to `'invalid'` and reload — confirm fallback to collapsed.
   - On Gooaye 股癌 (multi-source): one `追蹤` button visible. Click → toast `已追蹤所有來源`, button changes to `追蹤中`. Click → toast `已取消追蹤`, button reverts.
   - On a single-source KOL: same one-button experience.
   - On a KOL with no `kol_sources` (edge case): button hidden.
   - Platform icon row deduplicates correctly: a KOL with the same Twitter URL in `kol.socialLinks` and `kol_sources` shows the icon once.
   - Tier limit: as a Free user near their limit, click follow on a 2-source KOL — confirm `TrackingLimitGate` opens and no partial subscription is created.
8. **Type-check, lint, test, build pass.** No new tests required (per project precedent for thin layout components).
9. **Follow-up commit (separate PR)**: delete `src/components/kol/subscription-toggle.tsx`. Verified zero call sites by grep.
