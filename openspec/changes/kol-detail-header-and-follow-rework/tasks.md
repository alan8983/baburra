## 1. Drilldown-expanded preference hook

- [ ] 1.1 Create `src/hooks/use-drilldown-expanded.ts` exporting `useDrilldownExpanded(): [boolean, (next: boolean) => void]`. Implementation per design D5: initial state `false`, hydrate from `localStorage.getItem('kols.detail.drilldown.expanded')` in `useEffect` (treat `'true'` as expanded, anything else as collapsed), wrap `localStorage.setItem` in try/catch.
- [ ] 1.2 Export `useDrilldownExpanded` from `src/hooks/index.ts`.

## 2. Platform-icon links row

- [ ] 2.1 Create `src/app/(app)/kols/[id]/_components/kol-platform-links.tsx`. Export `KolPlatformLinks` taking `{ sources: KolSource[], socialLinks: Record<string, string> }`. Build a deduplicated array per design D8: combine `sources[].platformUrl` and `Object.entries(socialLinks)`, normalise URLs (lowercase + strip trailing slash) for dedup, return one entry per unique URL retaining the platform field.
- [ ] 2.2 Render the row as `flex flex-wrap items-center gap-1.5`. For each entry render an `<a target="_blank" rel="noopener noreferrer" aria-label={platform link}>` containing `getPlatformIconByName(platform, 'h-4 w-4')`. The aria-label uses the i18n key `kols.detail.platformLink` interpolated with the platform name.
- [ ] 2.3 If both `sources` is empty and `socialLinks` is empty (no entries at all), render nothing — the parent must handle the case (Identity row remains valid without icons).

## 3. Consolidated KOL-level subscribe button

- [ ] 3.1 Create `src/app/(app)/kols/[id]/_components/kol-follow-button.tsx`. Export `KolFollowButton` taking `{ kolId: string, sources: KolSource[] }`.
- [ ] 3.2 Compute the state per design D6: `allSubscribed = sources.length > 0 && sources.every(isSubscribed)`. Hide the button entirely when `sources.length === 0`. Otherwise render a shadcn `<Button>` with variant `secondary` when fully subscribed and `outline` otherwise; label `kols.detail.follow.followingAll` / `kols.detail.follow.followAll`.
- [ ] 3.3 Wire the click handler: pre-check tier limit (read `TIER_LIMITS[userTier].kolTracking` and `subscriptions.length` via `useSubscriptions()`); if subscribing would exceed the limit, open the existing `<TrackingLimitGate>` dialog and return without firing mutations. Otherwise fan out via `Promise.allSettled` over `useSubscribe().mutateAsync` (for missing sources when subscribing) or `useUnsubscribe().mutateAsync` (for all sources when unsubscribing).
- [ ] 3.4 Toast wiring per design D7: on success → `toast.success(t('subscriptions.toast.followedAll'))` or `toast.success(t('subscriptions.toast.unsubscribedAll'))`. If any settled promise rejected → `toast.error(t('subscriptions.toast.followFailed'))` or `toast.error(t('subscriptions.toast.unsubscribeFailed'))`. While `isPending` (any of the underlying mutations), disable the button and show a small loading spinner inside (Lucide `Loader2`, animate-spin).
- [ ] 3.5 Verify in preview: on Gooaye 股癌 (or any multi-source KOL), the button replaces today's two `<SubscriptionToggle>` instances. Subscribe → toast appears; React Query invalidation re-renders the button as `追蹤中`. Unsubscribe → toast and re-render to `追蹤`.

## 4. Drilldown disclosure component

- [ ] 4.1 Create `src/app/(app)/kols/[id]/_components/kol-drilldown.tsx`. Export `KolDrilldown` taking `{ bucket: WinRateBucket | null, perStockRows: PerStockRow[] }` (the existing types from `kol-scorecard.tsx`).
- [ ] 4.2 Implement the disclosure pattern per design D4: a `<button type="button" aria-expanded={expanded} aria-controls="kol-drilldown-body">` with a Lucide `ChevronRight` icon (rotates 90° via `cn('transition-transform', expanded && 'rotate-90')`) and the label from `kols.detail.drilldown.label` (zh-TW: `進階分析`). Below the button, conditionally render `<div id="kol-drilldown-body">` containing `<ScorecardAdvancedMetrics bucket={bucket} />` and the per-stock chips strip (extracted from today's `kol-scorecard.tsx`).
- [ ] 4.3 Wire `useDrilldownExpanded()` for the open/close state. On first render (before `useEffect` hydration) the body is collapsed; after hydration it reflects the localStorage value.

## 5. Refactor kol-scorecard to three rows

- [ ] 5.1 In `src/app/(app)/kols/[id]/_components/kol-scorecard.tsx`, replace the existing `flex-col gap-6 lg:flex-row lg:items-start` outer layout with `flex-col gap-4`. Three direct children, in order: identity row, headline row, drilldown disclosure.
- [ ] 5.2 **Identity row** (`flex flex-row flex-wrap items-center gap-2`): `<Avatar className="h-15 w-15">` (60×60 — adjust the existing `h-20 w-20` to `h-15 w-15`) | `<h1>{kol.name}</h1>` | `{kol.bio && <p className="text-muted-foreground line-clamp-2 text-sm sm:line-clamp-1">{kol.bio}</p>}` | post-count badge | follower badge (when applicable) | `<KolPlatformLinks sources={sources ?? []} socialLinks={kol.socialLinks} />` | `<div className="ml-auto"><KolFollowButton kolId={id} sources={sources ?? []} /></div>`.
- [ ] 5.3 **Headline row** (`flex flex-col gap-3 md:flex-row md:items-start md:gap-4`): `<PeriodSelector value={selectedPeriod} onChange={setOverride} />` | a `<div>` containing `<WinRateRing>`, the sample-size text, the Insufficient/Significant/threshold badges, and the inferred-tickers caveat (all reused from today's render) | `<SigmaBandHistogram bins={histogram} />` (when `directionalSampleSize > 0`) | a 4-cell grid for the 4-period returns (lift the existing JSX out of the current `<BlurGate>` wrapper).
  - Confirm with product whether the 4-period grid should remain inside `<BlurGate feature="win_rate_breakdown">`. Default: lift it out (visible to free users); revert if product objects.
- [ ] 5.4 **Drilldown row**: render `<KolDrilldown bucket={selectedBucket} perStockRows={perStockRows} />`. Move the per-stock chip strip from today's location (inside the right-column `<BlurGate>`) into `KolDrilldown`'s body. The `<BlurGate feature="win_rate_breakdown">` wrapper stays around the per-stock chips block inside the drilldown body to preserve the paywall behaviour for that breakdown.
- [ ] 5.5 Remove the existing `<SubscriptionToggle>` render block (the `{sources && sources.length > 0 && ...}` JSX) — replaced by `KolFollowButton` in Row 1. Remove the existing `kol.socialLinks` text-link row — replaced by `KolPlatformLinks` icons in Row 1.
- [ ] 5.6 Remove unused imports from `kol-scorecard.tsx`: `SubscriptionToggle`, `ExternalLink` (the lucide icon for the old social-links row).

## 6. i18n

- [ ] 6.1 In `src/messages/zh-TW/kols.json`, add under `detail`:
  - `drilldown.label` → `進階分析`
  - `follow.followAll` → `追蹤`
  - `follow.followingAll` → `追蹤中`
  - `platformLink` → `前往 {platform}`
- [ ] 6.2 In `src/messages/zh-TW/subscriptions.json`, add under `toast`:
  - `followedAll` → `已追蹤所有來源`
  - `followFailed` → `部分追蹤操作失敗`
  - `unsubscribedAll` → `已取消追蹤`
  - `unsubscribeFailed` → `部分取消操作失敗`
- [ ] 6.3 In `src/messages/en/kols.json`, add under `detail`:
  - `drilldown.label` → `Advanced analytics`
  - `follow.followAll` → `Follow`
  - `follow.followingAll` → `Following`
  - `platformLink` → `Open {platform}`
- [ ] 6.4 In `src/messages/en/subscriptions.json`, add under `toast`:
  - `followedAll` → `Following all sources`
  - `followFailed` → `Some follow actions failed`
  - `unsubscribedAll` → `Unfollowed`
  - `unsubscribeFailed` → `Some unfollow actions failed`
- [ ] 6.5 Verify no missing-translation console warnings on the KOL detail page in dev (`npm run dev`).

## 7. Verification

- [ ] 7.1 `npm run type-check` clean.
- [ ] 7.2 `npm test` — all unit tests pass. Existing `kol-stock-section.test.tsx` and `page-pagination.test.tsx` should remain green (neither file is modified). No new tests required for thin layout components.
- [ ] 7.3 `npm run lint` clean.
- [ ] 7.4 `npm run build` succeeds.
- [ ] 7.5 Manual QA in the preview tool — required scenarios:
  - **Multi-source KOL (Gooaye 股癌)**: open `/kols/<gooaye-id>`. Confirm the header has the three-row structure. Identity row shows avatar, name, bio, badges, two platform icons (YouTube + Podcast), and one `追蹤` button. Click `追蹤` → toast `已追蹤所有來源` appears, button changes to `追蹤中`. Click again → toast `已取消追蹤`, button reverts. Manually flip one of the two `subscriptions` rows (via Supabase dashboard) to simulate a partial state — confirm the button shows `追蹤` (not `追蹤中`) and clicking it tops up the missing source.
  - **Single-source KOL**: open any single-source KOL detail page. Confirm one platform icon and one subscribe button. Subscribe / unsubscribe cycle works.
  - **No-source KOL** (edge case, may not exist in production): if findable, confirm subscribe button is hidden and platform icons row is empty.
  - **Drilldown disclosure**: confirm collapsed by default. Click → expands smoothly (instant render is acceptable, no animation expected). Reload → still expanded. Open DevTools Application → Local Storage → confirm `kols.detail.drilldown.expanded === 'true'`. Manually set the value to `'invalid'` and reload — confirm fallback to collapsed.
  - **Tier limit**: as a Free user near their `kolTracking` limit, click `追蹤` on a 2-source KOL that would exceed. Confirm the existing `TrackingLimitGate` dialog opens and no subscribe requests fire (check DevTools Network tab — zero `POST /api/subscriptions` calls).
  - **Mobile (`iPhone 14` viewport)**: identity row wraps gracefully (avatar + name on one line, bio + badges on next, platform icons + button below). Headline row stacks vertically. Drilldown body when expanded is single-column.

## 8. Cleanup (separate follow-up commit)

- [ ] 8.1 Verify `SubscriptionToggle` has zero call sites in `src/`: `grep -r "SubscriptionToggle" src/` should return only the file's own definition.
- [ ] 8.2 Delete `src/components/kol/subscription-toggle.tsx`. There is no test file under `src/components/kol/__tests__/` to remove.
- [ ] 8.3 Run `npm run type-check`, `npm run lint`, `npm run build` to confirm no broken imports.
