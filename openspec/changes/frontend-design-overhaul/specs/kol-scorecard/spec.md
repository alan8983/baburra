## ADDED Requirements

### Requirement: KOL detail page displays a visual scorecard
The KOL detail page header SHALL be replaced with a visual scorecard component that presents the KOL's performance metrics in a graphical format.

The scorecard SHALL include:
- A circular progress ring (SVG) displaying the overall win rate percentage
- A multi-period return display showing 5d, 30d, 90d, and 365d returns with color coding (green for positive, red for negative)
- The KOL's avatar, name, and bio (preserving existing information)

#### Scenario: KOL with complete metrics
- **WHEN** a KOL detail page loads for a KOL with win rate and return data across all periods
- **THEN** the scorecard displays a filled progress ring at the win rate percentage, and all four return period values with appropriate coloring

#### Scenario: KOL with partial metrics
- **WHEN** a KOL has win rate data but is missing some return periods (e.g., no 365d data yet)
- **THEN** the scorecard displays the win rate ring and available return values, with "N/A" for missing periods in muted text

#### Scenario: KOL with no resolved predictions
- **WHEN** a KOL has posts but none have resolved price changes
- **THEN** the scorecard displays an empty progress ring (0%) with a "No data yet" label and all return periods showing "Pending"

### Requirement: Win rate ring animates on load
The circular progress ring SHALL animate from 0% to the actual win rate value when the scorecard first renders.

#### Scenario: Scorecard renders with data
- **WHEN** the KOL scorecard component mounts with win rate data
- **THEN** the progress ring SVG stroke animates from 0 to the win rate percentage over approximately 800ms using a CSS transition on `stroke-dashoffset`

#### Scenario: Reduced motion preference
- **WHEN** the user has `prefers-reduced-motion: reduce` enabled
- **THEN** the progress ring displays at the final value immediately without animation

### Requirement: Scorecard displays sector performance breakdown
The scorecard SHALL include a compact sector/category performance breakdown showing which types of stocks the KOL performs best and worst on.

#### Scenario: KOL has posts across multiple stock sectors
- **WHEN** a KOL has predictions spanning stocks in different categories (e.g., Tech, Crypto, Energy)
- **THEN** the scorecard displays a compact table or bar list showing each sector with its win rate, sorted by performance (best first)

#### Scenario: KOL has posts in only one sector
- **WHEN** all of a KOL's predictions are for stocks in the same category
- **THEN** the sector breakdown displays that single sector with its win rate, without a comparative ranking
