## 1. Micro-Interactions Foundation

- [x] 1.1 Add CSS `@keyframes` for fade-up, stagger, scale-pulse, and count-up animations in `globals.css`, with `prefers-reduced-motion` fallbacks
- [x] 1.2 Create `src/lib/animations.ts` utility with `StaggeredList` wrapper component and `useAnimatedCounter` hook
- [x] 1.3 Create `src/components/ui/animated-number.tsx` — reusable counting number component using the `useAnimatedCounter` hook
- [x] 1.4 Add smooth skeleton-to-content opacity transition to existing loading patterns (update Skeleton component or add a `FadeIn` wrapper)

## 2. Post Verdict Hero

- [x] 2.1 Create `src/app/(app)/posts/[id]/_components/verdict-hero.tsx` — verdict hero component with sentiment call, price result, and traffic-light indicator (check/X/clock)
- [x] 2.2 Add verdict logic: compare sentiment direction (bullish/bearish) against price change sign to determine correct/incorrect/pending state
- [x] 2.3 Integrate verdict hero into post detail page above existing content, with fade-up entrance animation
- [x] 2.4 Handle multi-stock posts: show primary stock verdict with note about additional stocks
- [x] 2.5 Add i18n translation keys for verdict labels (`correct`, `incorrect`, `pending`, etc.) in both `zh-TW` and `en`

## 3. Dashboard Insights Redesign

- [x] 3.1 Create `src/app/(app)/dashboard/_components/portfolio-pulse.tsx` — aggregate win rate, average return, and 30d trend indicator using existing hook data
- [x] 3.2 Create `src/app/(app)/dashboard/_components/hot-takes-feed.tsx` — last-48h posts with KOL avatar, sentiment, stock, and price result
- [x] 3.3 Create `src/app/(app)/dashboard/_components/stock-movers.tsx` — top 5 stocks by absolute price change in last 7 days with KOL opinion count
- [x] 3.4 Create `src/app/(app)/dashboard/_components/kol-leaderboard.tsx` — KOLs ranked by win rate (descending) with avatar, name, win rate, and call count
- [x] 3.5 Restructure dashboard page to use new widget components, replacing current stats cards + lists layout
- [x] 3.6 Add empty states for each widget when no data is available
- [x] 3.7 Add i18n translation keys for all dashboard widget labels in both `zh-TW` and `en`
- [x] 3.8 Apply stagger animations and animated counters to dashboard widgets

## 4. KOL Scorecard

- [x] 4.1 Create `src/app/(app)/kols/[id]/_components/win-rate-ring.tsx` — SVG circular progress ring with CSS `stroke-dashoffset` animation
- [x] 4.2 Create `src/app/(app)/kols/[id]/_components/kol-scorecard.tsx` — composite scorecard with win rate ring, multi-period return display (5d/30d/90d/365d), and KOL identity (avatar, name, bio)
- [x] 4.3 Add sector performance breakdown to scorecard — compact list of stock categories with per-sector win rates, sorted best-to-worst
- [x] 4.4 Integrate scorecard into KOL detail page, replacing current flat-number header display
- [x] 4.5 Add i18n translation keys for scorecard labels in both `zh-TW` and `en`

## 5. Login Page Redesign

- [x] 5.1 Redesign login page with split-panel layout: decorative brand panel (left) + auth form (right), using the `frontend-design` skill for high design quality
- [x] 5.2 Apply the same split-panel treatment to the register page, reusing the brand panel component
- [x] 5.3 Ensure brand panel is hidden on mobile (below md breakpoint), showing only the auth form
- [x] 5.4 Verify dark mode support on login/register using existing OKLCH tokens

## 6. Polish & Integration

- [x] 6.1 Apply stagger animations to posts list, KOLs grid, stocks grid, and bookmarks list pages
- [x] 6.2 Add bookmark toggle pulse animation and delete fade-out animation to action buttons
- [x] 6.3 Verify all animations respect `prefers-reduced-motion` across all new components
- [x] 6.4 Run `npm run type-check` and `npm run lint` — fix any issues
- [x] 6.5 Run `npm test` — fix any broken tests from layout changes
