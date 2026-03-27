## ADDED Requirements

### Requirement: Dashboard displays a Portfolio Pulse summary
The dashboard SHALL display a Portfolio Pulse section at the top showing aggregate performance metrics computed client-side from existing data.

The Portfolio Pulse SHALL display:
- Overall win rate across all tracked KOLs (percentage)
- Average return rate across all tracked posts with price data
- A visual trend indicator (up/down/flat arrow) based on 30-day direction

#### Scenario: User has tracked posts with price data
- **WHEN** the dashboard loads and the user has posts with resolved price changes
- **THEN** the Portfolio Pulse displays the computed win rate, average return, and trend direction

#### Scenario: User has no tracked posts
- **WHEN** the dashboard loads and the user has no posts
- **THEN** the Portfolio Pulse displays an empty state prompting the user to add their first KOL post via Quick Input

### Requirement: Dashboard displays a Hot Takes feed
The dashboard SHALL display a Hot Takes section showing recent KOL predictions (from the last 48 hours) alongside their price performance, sorted by recency.

#### Scenario: Recent posts exist with price data
- **WHEN** posts from the last 48 hours have associated price changes
- **THEN** the Hot Takes feed displays each post with KOL avatar, sentiment badge, stock ticker, and price change result

#### Scenario: No recent posts
- **WHEN** no posts exist from the last 48 hours
- **THEN** the Hot Takes section displays a message indicating no recent activity

### Requirement: Dashboard displays Stock Movers
The dashboard SHALL display a Stock Movers section showing tracked stocks with the largest absolute price movements in the last 7 days, limited to the top 5.

#### Scenario: Stocks have recent price data
- **WHEN** tracked stocks have price change data within the last 7 days
- **THEN** the Stock Movers section displays up to 5 stocks sorted by absolute price change magnitude, with the number of KOLs who have opinions on each

#### Scenario: No stock data available
- **WHEN** no tracked stocks have recent price data
- **THEN** the Stock Movers section displays an empty state

### Requirement: Dashboard displays KOL Leaderboard by win rate
The dashboard SHALL display a KOL Leaderboard section ranking KOLs by win rate (descending), replacing the current "Top KOLs by post count" section.

#### Scenario: Multiple KOLs with win rate data
- **WHEN** the user tracks multiple KOLs that have resolved predictions
- **THEN** the leaderboard ranks KOLs by win rate percentage, showing avatar, name, win rate, and total calls count

#### Scenario: KOL with no resolved predictions
- **WHEN** a KOL has posts but no resolved price changes yet
- **THEN** that KOL appears at the bottom of the leaderboard with a "Pending" indicator instead of a win rate
