## ADDED Requirements

### Requirement: Input page two-column dashboard layout
The `/input` page SHALL render as a two-column grid at the `lg` breakpoint and above, with the smart-input card and recent scrape jobs in the main column (≈2/3 width) and a quick-nav rail in the right column (≈1/3 width). Below `lg`, the page SHALL collapse to a single column with the right rail stacked below the main column.

#### Scenario: Desktop layout at lg and above
- **WHEN** a user viewing `/input` on a viewport ≥1024px wide
- **THEN** the page renders a grid where the smart-input card + recent jobs occupy the left 2/3 and the quick-nav rail occupies the right 1/3

#### Scenario: Mobile / tablet layout below lg
- **WHEN** a user viewing `/input` on a viewport <1024px wide
- **THEN** the page renders as a single column with the smart-input card on top, recent jobs next, and the quick-nav rail stacked below

### Requirement: Quick-nav rail dashboard card
The quick-nav rail SHALL include a Dashboard card with descriptive copy whose entire surface is a link to `/dashboard`.

#### Scenario: Click dashboard card
- **WHEN** a user clicks anywhere on the Dashboard card
- **THEN** the browser navigates to `/dashboard`

### Requirement: Quick-nav rail KOLs card with recent KOL chips
The quick-nav rail SHALL include a KOLs card with descriptive copy, a header link to `/kols`, and up to 3 chips representing the 3 most recently added KOLs ordered by `createdAt` descending. Each chip SHALL link to the corresponding KOL detail page. When no KOLs exist, the card SHALL render an empty-state hint instead of chips.

#### Scenario: Recent KOLs chips render
- **WHEN** a user has ≥3 KOLs
- **THEN** the KOLs card displays 3 chips corresponding to the 3 KOLs with the most recent `createdAt` timestamps, each linking to `/kols/[id]`

#### Scenario: Fewer than 3 KOLs
- **WHEN** a user has 1 or 2 KOLs
- **THEN** the KOLs card displays only those chips (no placeholder fills)

#### Scenario: No KOLs
- **WHEN** a user has 0 KOLs
- **THEN** the KOLs card renders descriptive copy and an empty-state hint, with no chips; the header link to `/kols` is still active

### Requirement: Quick-nav rail Stocks card with recent stock chips
The quick-nav rail SHALL include a Stocks card with descriptive copy, a header link to `/stocks`, and up to 3 chips representing the 3 most recently added stocks ordered by `createdAt` descending. Each chip SHALL link to the corresponding stock detail page. When no stocks exist, the card SHALL render an empty-state hint instead of chips.

#### Scenario: Recent stocks chips render
- **WHEN** a user has ≥3 stocks
- **THEN** the Stocks card displays 3 chips corresponding to the 3 stocks with the most recent `createdAt` timestamps, each linking to `/stocks/[id]`

#### Scenario: No stocks
- **WHEN** a user has 0 stocks
- **THEN** the Stocks card renders descriptive copy and an empty-state hint, with no chips; the header link to `/stocks` is still active

### Requirement: Quick-nav rail loading state
The quick-nav rail SHALL render skeleton chips for KOLs and Stocks cards while their underlying queries are loading.

#### Scenario: Initial data load
- **WHEN** the `useKols` or `useStocks` query is in its loading state
- **THEN** the corresponding card renders 3 skeleton chips in place of real data
