## ADDED Requirements

### Requirement: Post detail page displays a verdict hero section
The post detail page SHALL display a prominent verdict hero section at the top of the page, above all other content, that immediately communicates whether the KOL's prediction was correct.

The verdict hero SHALL display:
- The KOL's sentiment call (Strongly Bullish / Bullish / Neutral / Bearish / Strongly Bearish) with corresponding color
- The actual price change result for the best available time period (5d > 30d > 90d > 1y)
- A verdict indicator: green checkmark for correct predictions, red X for incorrect, amber clock for pending
- The time period label for the displayed result

#### Scenario: Bullish prediction with positive price change
- **WHEN** a post has sentiment "Bullish" or "Strongly Bullish" AND the best available price change is positive
- **THEN** the verdict hero displays a green checkmark indicator, the sentiment label in green, and the price change percentage in green

#### Scenario: Bullish prediction with negative price change
- **WHEN** a post has sentiment "Bullish" or "Strongly Bullish" AND the best available price change is negative
- **THEN** the verdict hero displays a red X indicator, the sentiment label in green (reflecting the call), and the price change percentage in red

#### Scenario: Bearish prediction with negative price change
- **WHEN** a post has sentiment "Bearish" or "Strongly Bearish" AND the best available price change is negative
- **THEN** the verdict hero displays a green checkmark indicator (prediction was correct), the sentiment label in red, and the price change percentage in red

#### Scenario: Post with pending price data
- **WHEN** a post has no price change data available yet (all periods show "pending")
- **THEN** the verdict hero displays an amber clock indicator with a "Pending" label instead of a price change value

#### Scenario: Post with multiple stocks
- **WHEN** a post mentions multiple stocks
- **THEN** the verdict hero displays the result for the primary (first) stock, with a note indicating additional stocks are tracked below

### Requirement: Verdict hero respects reduced motion preferences
The verdict hero entrance animation SHALL respect the user's `prefers-reduced-motion` media query.

#### Scenario: User has reduced motion enabled
- **WHEN** the user's system has `prefers-reduced-motion: reduce` enabled
- **THEN** the verdict hero appears without entrance animation (immediate render, no slide/fade)

#### Scenario: User has no motion preference
- **WHEN** the user's system has no reduced motion preference
- **THEN** the verdict hero animates in with a subtle fade-up entrance on page load
