## Context

Baburra.io's frontend is built with Next.js 16 (App Router), React 19, Tailwind CSS 4, and shadcn/ui. Charts use lightweight-charts v5. The design system uses OKLCH color tokens with full dark mode support. The app already has `tw-animate-css` for Tailwind-based animations but no dedicated animation library like framer-motion.

The current UI is functional and well-structured but reads as a data management tool rather than an insight-driven analytics platform. Five areas have been identified for improvement: post verdict hero, dashboard insights, login redesign, micro-interactions, and KOL scorecard.

All improvements are purely presentational — no API, data model, or backend changes are required. Every piece of data needed is already available through existing React Query hooks.

## Goals / Non-Goals

**Goals:**
- Make the post detail page instantly communicate whether a KOL's prediction was right or wrong via a prominent verdict hero section
- Transform the dashboard from stat counts + lists into an actionable insights hub with portfolio pulse, hot takes, movers, and leaderboard
- Redesign the login page to set a financial-grade first impression with brand identity
- Add a cohesive micro-interactions layer (list stagger, stat counters, skeleton transitions, action feedback) using CSS animations + tw-animate-css — no new runtime dependencies
- Create a KOL scorecard with visual win rate gauge, multi-period return display, and sector breakdown

**Non-Goals:**
- No backend/API changes — all data comes from existing hooks
- No new database queries or aggregations — compute derived metrics client-side from existing data
- No redesign of navigation structure or information architecture — sidebar and routing stay the same
- No mobile-specific redesign — maintain existing responsive approach, just polish it
- No branding/logo changes — visual identity refinements only

## Decisions

### 1. Animation approach: CSS + tw-animate-css (no framer-motion)

**Decision**: Use CSS animations, CSS transitions, and the existing `tw-animate-css` library. Do NOT add framer-motion or react-spring.

**Rationale**: The project already has tw-animate-css. The animations needed (fade-in, slide-up, stagger delays, number counting) are achievable with CSS `@keyframes` + Tailwind utilities. Adding framer-motion (~30KB gzipped) would increase bundle size for animations that CSS handles natively. React 19's concurrent features also make imperative animation libraries less necessary.

**Alternatives considered**:
- framer-motion: More powerful for layout animations and gesture-driven interactions, but overkill for our needs and adds significant bundle weight
- react-spring: Physics-based animations are nice but unnecessary for UI polish work

### 2. Verdict Hero: Traffic-light visual metaphor

**Decision**: Use a large, color-coded verdict section at the top of the post detail page with a simple visual language: green check for correct predictions, red X for wrong, amber clock for pending. Include the KOL's sentiment call, the actual price result, and the time period prominently.

**Rationale**: The core value prop of Baburra.io is answering "was this KOL right?" — this should be answerable in under 1 second of looking at the page. A traffic-light metaphor is universally understood and works across cultures (important for zh-TW + en locales).

### 3. Dashboard: Widget-based layout with existing data

**Decision**: Restructure the dashboard into 4 widget areas (Portfolio Pulse, Hot Takes, Stock Movers, KOL Leaderboard) that derive all metrics client-side from existing hook data. Use the existing `useKols`, `usePosts`, `useStocks` hooks — no new API endpoints.

**Rationale**: Keeps the change purely frontend. The existing hooks already return win rates, return metrics, and recent posts. Client-side aggregation (e.g., "top KOLs by win rate" instead of "by post count") is a simple sort change on already-fetched data.

**Trade-off**: Client-side aggregation means all data must be loaded before insights render. Skeleton states will cover this, and the data sizes (dozens of KOLs, hundreds of posts) are small enough for client-side processing.

### 4. Login page: Split-panel layout with data visualization background

**Decision**: Use a split-panel design — left side with a decorative data visualization or gradient mesh background conveying financial sophistication, right side with the auth form. Keep the existing auth logic unchanged.

**Rationale**: Split-panel login is a proven pattern for SaaS products that need to communicate brand values alongside functionality. It gives space for visual storytelling without cluttering the form. The decorative side can show abstract chart patterns or animated gradient meshes to suggest financial data without being literal.

### 5. KOL Scorecard: Composite component with win rate ring

**Decision**: Create a `KolScorecard` composite component that replaces the current flat-number display with: (a) a circular progress ring for win rate, (b) a horizontal bar chart or heatmap for multi-period returns, and (c) a compact sector breakdown table. All using CSS/SVG — no additional charting library.

**Rationale**: lightweight-charts is designed for financial time-series, not small statistical visualizations. A simple SVG ring + CSS bars will be lighter and more customizable than bringing in another chart library for these small widgets.

### 6. Component structure: Colocated with pages, not in shared components

**Decision**: New components (VerdictHero, PortfolioPulse, KolScorecard, etc.) live colocated with their page directories (e.g., `src/app/(app)/posts/[id]/_components/verdict-hero.tsx`) rather than in `src/components/`. Animation utilities go in `src/lib/animations.ts` and `globals.css`.

**Rationale**: These components are page-specific, not reusable across the app. Colocation keeps them discoverable and avoids polluting the shared components directory. Only truly shared utilities (animation helpers, CSS keyframes) go in shared locations.

## Risks / Trade-offs

- **[Client-side aggregation performance]** → Dashboard widgets compute metrics from full data sets. Mitigation: Data sizes are small (< 1000 records), and React 19's concurrent rendering handles this well. Add `useMemo` for expensive computations.

- **[Animation accessibility]** → Users with vestibular disorders may be affected by animations. Mitigation: Respect `prefers-reduced-motion` media query — all animations must have a reduced-motion fallback that disables motion but keeps opacity/visibility transitions.

- **[Login redesign scope creep]** → Easy to over-invest in the login page. Mitigation: Timebox to the split-panel layout + gradient background. No custom illustrations or complex animations.

- **[Bundle size from SVG scorecards]** → Inline SVGs for win rate rings and charts. Mitigation: Keep SVGs simple and use CSS for coloring/animation. No SVG libraries.

- **[i18n for new dashboard copy]** → New widget titles, labels, and empty states need translations in both zh-TW and en. Mitigation: Add translation keys alongside component creation — don't defer.
