## Why

The core UI is functionally complete but lacks the visual polish and information design needed to deliver on Baburra.io's value proposition: helping users instantly see whether a KOL's investment call was right or wrong. The dashboard surfaces counts instead of insights, the post detail page buries the verdict, and the app lacks the micro-interactions that make a financial tool feel trustworthy and premium. Addressing these five areas will significantly improve user engagement, first impressions, and the clarity of analytical data.

## What Changes

- **Post Detail "Verdict" redesign**: Add a prominent hero section to post detail pages that immediately communicates whether a KOL's prediction was correct, with large visual indicators for sentiment vs. actual result, before the user scrolls to charts or content.
- **Dashboard reimagining**: Transform the dashboard from a static report (stat counts + recent lists) into an actionable command center with portfolio pulse metrics, hot takes needing attention, stock movers, and a KOL leaderboard ranked by win rate.
- **Login/Landing page redesign**: Replace the generic centered card with a design that communicates financial sophistication and trust — the first impression that sets the brand tone.
- **Micro-interactions layer**: Add entrance animations for card lists (stagger), number counting animations for stats, skeleton-to-content transitions, bookmark/action feedback animations, and subtle page transitions across the app.
- **KOL Scorecard**: Redesign the KOL detail header into a visual scorecard with win rate gauge, return rate heatmap across time periods, and sector-level performance breakdown.

## Capabilities

### New Capabilities
- `post-verdict-hero`: Hero section component for post detail pages that visually communicates prediction accuracy (sentiment vs. actual price movement) with large, dramatic visual treatment.
- `dashboard-insights`: Reimagined dashboard layout with portfolio pulse, hot takes feed, stock movers panel, and win-rate-based KOL leaderboard replacing the current stats-and-lists layout.
- `login-redesign`: Redesigned login/register page with financial-grade visual identity, trust signals, and brand-setting aesthetics.
- `micro-interactions`: App-wide animation system including list entrance stagger, stat counters, skeleton transitions, action feedback animations, and page transitions.
- `kol-scorecard`: Visual scorecard component for KOL detail pages with win rate gauge, multi-period return heatmap, and sector performance breakdown.

### Modified Capabilities

_(No existing spec-level requirements are changing — these are all additive UI/UX improvements on top of existing data and API contracts.)_

## Impact

- **Components affected**: Dashboard page, Post detail page, KOL detail page, Login page, plus app-wide animation utilities
- **New components**: VerdictHero, PortfolioPulse, HotTakesFeed, StockMovers, KolLeaderboard, KolScorecard, AnimatedCounter, StaggeredList
- **Dependencies**: May introduce framer-motion for animations (evaluate vs. CSS-only approach)
- **Existing APIs**: No API changes required — all improvements consume existing data from hooks/repositories
- **Risk**: Low — purely presentational changes with no backend or data model impact
- **Files touched**: ~15-20 component files, 2-3 page files, globals.css for animation utilities
