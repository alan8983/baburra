## Context

The Posts detail page has a 3-section vertical structure today:

```
┌────────────────────────────────────────────────────────┐
│ Header strip (back / delete / bookmark)                │
│ Re-analyze banner (conditional)                        │
│ VerdictHero                                            │
│ Avatar / name / sentiment / date / per-stock badges    │
├────────────────────────────────────────────────────────┤
│ ┌─ LEFT (lg:col 1) ──────┬─ RIGHT (lg:col 2) ─────────┐│
│ │ Card: post.content     │ Per-stock loop:             ││
│ │   .split('\n').map(p)  │   Card: K-line              ││
│ │   ← entire transcript  │   Card: Sentiment           ││
│ │     (5–15K words)      │   ← repeats per stock        ││
│ └────────────────────────┴─────────────────────────────┘│
├────────────────────────────────────────────────────────┤
│ <BlurGate feature="argument_cards">                    │
│   Per-ticker argument cards                            │
│ </BlurGate>                                            │
└────────────────────────────────────────────────────────┘
```

Two consequences:

1. The transcript dominates vertical space. The right column ends mid-page; everything below is just transcript paragraphs. Visually it reads as "this page is a transcript with some charts."
2. The argument cards — the AI-derived analytical output and arguably the page's primary value — render in a third orphan section below the two-column grid. New users frequently never scroll there. Power users who *do* scroll see them outside the post-and-charts context.

The four parts of this change:

- **Tabs in the left column** demote the transcript from "default content" to "one of three views," with the analytical views (Summary, Arguments) taking primary placement.
- **A chart-type toggle in the right column** inverts the per-stock-then-per-chart loop so users can scan all charts of one type at a glance and the page collapses to roughly half its current right-column height.
- **Promotion of the argument cards** out of the orphan section and into the Arguments tab, reusing the existing `PostArguments` component verbatim.
- **localStorage persistence** for the chart-type toggle so a user who prefers the Sentiment view doesn't reset to K-line on every navigation.

The change is purely frontend composition. No domain models, repositories, API routes, or migrations are touched.

## Goals / Non-Goals

**Goals:**

- The Posts detail page leads with the analytical output. Default load shows Summary, not transcript.
- A user with a multi-stock post can scan all K-lines or all Sentiment charts in a single eyeful, without scrolling past interleaved cards of the other type.
- The chart-mode preference is sticky across navigations on the same device — a Sentiment-preferring user stays on Sentiment.
- No reduction in available information. Every piece of data visible today (transcript, both chart types, argument cards, sentiment markers, paywall blur) remains accessible after the change, just behind one extra interaction layer where appropriate.
- The page works for posts in every analytical state: arguments not yet generated, arguments generated, free user under paywall, paid user, single-stock post, multi-stock post.

**Non-Goals:**

- Adding a `posts.summary` column or a new AI pass to generate dedicated summaries. Tracked in [#102](https://github.com/alan8983/baburra/issues/102) — Summary is derived at render time from argument data for v1.
- Redesigning the chart components themselves. `CandlestickChart` and `SentimentLineChart` continue to render exactly as today; only their container changes.
- Re-styling the page header strip, VerdictHero, or shared-heading section. Those keep their current layout.
- Per-stock sub-tabs inside the right column. The single chart-type toggle is sufficient for the median multi-stock post (1–4 stocks).
- Visual regression testing infrastructure. Manual preview verification is the contract for this rework.
- Mobile-specific reflow beyond what the existing `lg:grid-cols-2` breakpoint already provides.
- Replacing `localStorage` with a server-persisted preference (`profile.defaultChartMode`). Out of scope for v1; can be added later if cross-device consistency becomes a real ask.

## Decisions

### D1 — Tab framework: shadcn `Tabs`

Use the existing `src/components/ui/tabs.tsx` shadcn primitive. It's already in the project (verified via `ls`), Radix-backed, accessible by default (keyboard nav, ARIA), and styled to match the rest of the app's `New York` shadcn theme.

**Why not a custom segmented control?** The component already exists and meets requirements. Building a custom one is cost without benefit.

**Tab orientation**: horizontal across the top of the left column, matching the conventional left-to-right reading order of `[Summary | Arguments | Full transcript]`.

**Why this tab order?** Summary first because it's default-active and most users will hit it first. Arguments next because it's the most-information-dense tab — power users go straight there and shouldn't have to skip past transcript to find it. Full transcript last because it's the most niche use-case (verifying a quote, reading verbatim).

### D2 — Default tab + fall-through when arguments are not ready

**Default-active tab on first render: `Summary`.**

Fall-through rule: if `usePostArguments(id).data` is empty *and* `usePostArguments(id).isLoading` is false (i.e., the request has resolved with zero arguments), the active tab silently becomes `Full transcript`. The Summary and Arguments tabs remain visible in the strip but are visually disabled (greyed out, `pointer-events: none`) with a small inline `分析中...` hint visible inside the tab body if the user clicks them anyway.

```
Tab content state machine:

usePostArguments state          Active tab     Summary tab     Arguments tab
─────────────────────────       ───────────    ───────────     ─────────────
isLoading                       Summary        loading skel    loading skel
data.length > 0                 Summary        rendered        rendered
data.length === 0 && resolved   Full transcript disabled (hint) disabled (hint)
isError (network/server fail)   Full transcript disabled (hint) disabled (hint)
```

**Why fall-through to transcript on empty?** Because in that state the *only* readable content on the left is the transcript. Defaulting to an empty Summary tab would show the user a blank panel with no clear next step.

**Why keep the disabled tabs visible instead of hiding them?** The user should know that an analysis exists as a concept; if hidden, they wouldn't realize the page has more states. Disabled-but-visible communicates "this is coming."

**Free-user behaviour**: the Arguments tab content is wrapped in the existing `<BlurGate feature="argument_cards">` component, which renders a blurred preview + upgrade CTA. The tab itself is *not* disabled for free users — they can navigate to it and see the gate. Identical to today's behaviour, just inside a tab now.

### D3 — Summary synthesis algorithm

The Summary tab is a derived view, computed at render time from `argumentGroups` (the same `TickerArgumentGroup[]` that feeds the Arguments tab):

```ts
function buildSummary(groups: TickerArgumentGroup[]): TickerSummary[] {
  return groups.map((group) => {
    // Take top 3 arguments by confidence per ticker. Tie-break: prefer the
    // argument whose statement type is 'thesis' or 'recommendation' (the
    // headline-ier statements) over 'evidence' or 'caveat'.
    const ranked = [...group.arguments].sort(byConfidenceThenStatementType);
    const top = ranked.slice(0, 3);
    return {
      ticker: group.ticker,
      name: group.name,
      bullets: top.map((arg) => ({
        text: arg.summary ?? arg.originalText,
        sentiment: arg.sentiment,
        category: arg.categoryName,
      })),
    };
  });
}
```

**Why 3 bullets per ticker?** Empirically (sampling existing posts) most posts have 5–15 arguments per ticker; 3 captures the "headline thesis + supporting points" pattern without making the Summary tab as long as the Arguments tab. Three is also the natural Tailwind grid breakpoint for thumbnail-style summaries.

**Why prefer `summary` field over `originalText`?** `summary` is the AI-condensed version of an argument; `originalText` is the verbatim quote from the transcript. For a "Summary" surface the condensed version is the right pick. Falls back to `originalText` if `summary` is null.

**Why not a separate API call to generate a summary on the fly?** Because the Argument Analysis pass already extracts the same information at scrape time. Calling a second LLM at view time would duplicate work and add latency for zero analytical gain. If the existing arguments are insufficient as a summary, the right fix is improving the Argument pipeline, not adding a parallel one.

**Rendering style**: a vertical list, one `<section>` per ticker, with the ticker symbol and name as the heading and bullet points underneath. Each bullet has a small sentiment chip (reuses `colors.sentimentBadgeColors`). The visual weight should be lighter than the Arguments tab (no per-argument cards, no category groupings) — Summary is for skimming, Arguments is for studying.

### D4 — Arguments tab reuses `PostArguments` verbatim

The Arguments tab body renders:

```tsx
<BlurGate feature="argument_cards">
  {argumentGroups.map((group) => (
    <PostArguments key={group.ticker} tickerGroups={[group]} />
  ))}
</BlurGate>
```

This is a near-verbatim move of the existing block from the bottom of `page.tsx` into the tab. No restyling, no API change, no behaviour change.

**Why not pass the full `argumentGroups` array to a single `<PostArguments>` instance?** Because today's render iterates per-group and calls the component with a single-element array. Preserving that pattern minimises the diff and avoids any layout regression in `<PostArguments>` itself.

### D5 — Chart-mode toggle UI: `Tabs` again, not `Switch` or buttons

The chart-mode toggle uses the same shadcn `Tabs` primitive (with two tab triggers: K-line, Sentiment) rather than a `Switch` toggle, two `Button` components, or a `Select`.

**Reasons:**

- Visual consistency with the left column's `Tabs` — both halves of the layout use the same control vocabulary.
- Two equally-prominent options is exactly what `Tabs` is for. A `Switch` implies on/off, not "pick one of two." Buttons would force us to manually manage selected state styling.
- `Tabs` gives keyboard accessibility (left/right arrow keys cycle) for free.

The `TabsList` sits at the top of the right column, above the per-stock chart loop. The `TabsContent` panels each render the same per-stock loop but with one chart type.

### D6 — Persistence: `localStorage`, single key, hook abstraction

Persistence key: `posts.detail.chartMode`. Values: `'kline' | 'sentiment'`. Default if not set or invalid: `'kline'`.

A new hook `useChartModePreference()`:

```ts
type ChartMode = 'kline' | 'sentiment';

export function useChartModePreference(): [ChartMode, (m: ChartMode) => void] {
  const [mode, setMode] = useState<ChartMode>('kline');

  // Hydrate after mount to avoid SSR/CSR mismatch.
  useEffect(() => {
    const stored = window.localStorage.getItem('posts.detail.chartMode');
    if (stored === 'kline' || stored === 'sentiment') setMode(stored);
  }, []);

  const update = useCallback((next: ChartMode) => {
    setMode(next);
    try {
      window.localStorage.setItem('posts.detail.chartMode', next);
    } catch {
      // localStorage can throw in private-mode Safari and disabled-cookies
      // configurations. Silently ignore — the in-memory state still updates,
      // we just lose persistence for this session.
    }
  }, []);

  return [mode, update];
}
```

**Why a hook, not direct `localStorage` calls in the component?** Encapsulates the SSR-safety dance (initial state must match server-rendered HTML, hydration happens in `useEffect`), the try/catch for restricted environments, and the value-validation. Makes the component testable by mocking the hook.

**Why not `nuqs` / URL params?** URL params would let users share a "Sentiment view" link, but the user-facing decision was page-scoped persistence, not link-shareability. URL params also bloat the address bar for a minor UX preference.

**Why not Zustand?** Zustand is the project's choice for *cross-component* UI state (sidebar, loading indicators). The chart-mode preference is read in exactly one component (the chart toggle) and doesn't need cross-component coordination. `localStorage` directly is simpler.

**Why not `profile.defaultChartMode` server-side?** Same reason as Issue 4's drilldown disclosure (per-user, per-device): UI affordances belong in `localStorage`, real preferences belong in `profile`. Cross-device consistency for chart mode is not a known user need.

### D7 — Toggle visibility: `stocks.length >= 2`

When the post has fewer than 2 stocks, the chart-mode toggle does not render. The right column instead falls back to today's "render both K-line and Sentiment for the single stock" layout:

```
stocks.length === 0 → empty state (existing copy: detail.noStocks)
stocks.length === 1 → [K-line, Sentiment] stacked, no toggle
stocks.length >= 2  → toggle at top, then chart-type-filtered list
```

**Why?** With one stock, the toggle would just hide the other chart — there's nothing to scan across. Showing the toggle anyway adds chrome for no benefit and creates a "click toggle, then click toggle again, then realise nothing happens" moment for users with single-stock posts.

This keeps the layout familiar for the majority of single-stock posts (typical of Twitter/X posts and short YouTube clips) while adding the new affordance only where it pays off.

### D8 — SSR/CSR hydration

The Posts detail page is a Client Component (`'use client'`). React Query data is hydrated client-side only; there is no server-rendered initial state to mismatch with. However, the `useChartModePreference` hook still must not call `localStorage` during the initial render — Next.js still does an initial server-side render of client components for streaming, and `localStorage` is `undefined` there.

The hook's pattern (initial state defaults to `'kline'`, hydrate from localStorage in `useEffect`) handles this correctly. There may be a one-frame flash where a Sentiment-preferring user briefly sees K-line on first paint before hydration kicks in — acceptable cost given the alternative (cookies, server-side preference, or skipping the initial render) is far heavier.

### D9 — Mobile / responsive behavior

The existing layout uses `lg:grid-cols-2` — at `< lg` (≤ 1024px) the columns stack vertically. Tabs and the chart-mode toggle work identically at all breakpoints; no special mobile treatment.

Edge case: on narrow mobile widths (`< sm`), the three tab labels might wrap if the Chinese strings are long. shadcn `Tabs` handles this with horizontal scroll automatically — acceptable. The chart-mode toggle has only two short labels and won't wrap.

The transcript inside the Full transcript tab scrolls within its panel naturally (no special `max-height` needed; the page itself already scrolls).

### D10 — Removing the orphan argument section

The current page renders `<PostArguments>` in a separate block at the bottom, *outside* the two-column grid:

```tsx
{/* Two-column layout */}
<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">...</div>

{/* Arguments section */}
{argumentGroups.length > 0 && (
  <BlurGate feature="argument_cards">...</BlurGate>
)}
```

After this change, that orphan block is **deleted**. The argument-cards rendering moves inside the `<TabsContent value="arguments">` panel. Net effect on the page: one less major section, charts and analysis live within the same two-column grid.

**Why delete instead of leave both for backwards compatibility?** Duplication is worse than absence. If the orphan section stayed, free users (who already see the gate inside the Arguments tab) would also see it again at the bottom — confusing UX. There are no other consumers of the orphan block.

## Risks / Trade-offs

- **Risk**: the Summary derived from arguments reads awkwardly compared to a hand-written summary. **Mitigation**: bullet rendering with sentiment chips is closer to a quotable summary than to prose, sidestepping the "this clearly isn't human-written" problem. If users complain post-launch, [#102](https://github.com/alan8983/baburra/issues/102) is the escape hatch (real summary column + AI pass).
- **Risk**: a power user who always wants both K-line and Sentiment side-by-side now has to toggle between them. **Mitigation**: the Sentiment chart's primary value (showing where the call landed on the price line) is preserved; users who really want both can still see them by toggling, and single-stock posts stack both. If this becomes a sustained complaint we can add a "show both" tertiary tab without disturbing the default.
- **Risk**: localStorage persistence creates per-device divergence — a user on desktop sees K-line, on mobile sees Sentiment. **Mitigation**: this is the documented intent (per-user, per-device). Acceptable for a minor preference.
- **Trade-off**: Three new component files for an arguably-modest UI rework. Inlining everything in `page.tsx` would be ~150 fewer lines but `page.tsx` is already 600 lines and nesting Tabs + toggle + per-stock loop inline would push readability past acceptable.
- **Trade-off**: the disabled-tabs-with-hint pattern in the no-arguments state means the Summary and Arguments tab triggers exist in the DOM even when they're non-functional. The accessibility implication is minor (`aria-disabled` + `tabindex="-1"` is the correct affordance for "exists but currently unavailable") and matches how shadcn `Tabs` handles disabled triggers natively.

## Migration Plan

This change is a single user-visible release with no data migration. Suggested commit order to keep each PR step reviewable:

1. **Add the chart-mode preference hook** (`src/hooks/use-chart-mode-preference.ts`) with no consumers yet. Trivially passes type-check and unit tests.
2. **Extract the chart rendering** into `src/app/(app)/posts/[id]/_components/post-chart-tabs.tsx` while preserving today's "render both per stock" layout. This is a refactor with zero user-visible change.
3. **Add the K-line / Sentiment toggle** inside `post-chart-tabs.tsx` and wire to the preference hook. Hide when `stocks.length < 2`. Verify in preview that toggling and persistence work; verify single-stock posts render unchanged.
4. **Build the Summary view** (`post-summary.tsx`) and the tab container (`post-content-tabs.tsx`). The container moves the existing transcript card and the existing argument block (still imported in the same file) into tabs.
5. **Wire the page**: replace the left column's transcript card with `<PostContentTabs>` and delete the orphan argument block at the bottom.
6. **i18n**: add the new keys in zh-TW and en in the same commit as the wiring, so no translation-missing flicker.
7. **Manual QA in the preview tool**:
   - Open a post with > 0 arguments and ≥ 2 stocks; verify Summary tab default, Arguments tab content, transcript tab, K-line / Sentiment toggle, and that toggle persists across reload (via DevTools Application > Local Storage).
   - Open a post with no arguments yet (newly scraped); verify Summary and Arguments tabs disabled with `分析中...` hint, transcript tab auto-active.
   - Open a single-stock post; verify no toggle, both charts stacked.
   - Resize the viewport to `< lg`; verify columns stack and tabs/toggle still function.
   - As a free user (BlurGate active); verify Arguments tab shows the existing blur + CTA, not a broken render.
8. **Type-check, lint, test, build pass.** No new tests required (per `redesign-scorecard-with-directional-ring-and-histogram` precedent for thin composition components in this project).
