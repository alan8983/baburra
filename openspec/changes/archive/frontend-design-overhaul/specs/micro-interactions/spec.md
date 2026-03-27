## ADDED Requirements

### Requirement: List items animate in with stagger effect
Card lists (posts, KOLs, stocks, bookmarks) SHALL animate in with a staggered fade-up effect when they first render.

Each card SHALL have an incremental animation delay (e.g., 50ms per item) creating a cascade effect from top to bottom.

#### Scenario: Post list loads
- **WHEN** the posts list page renders with results
- **THEN** each post card fades in and slides up with a staggered delay, creating a cascade effect

#### Scenario: List updates after filter change
- **WHEN** the user applies a filter and the list re-renders with new results
- **THEN** the new list items animate in with the stagger effect

#### Scenario: Reduced motion preference
- **WHEN** the user has `prefers-reduced-motion: reduce` enabled
- **THEN** list items appear immediately without animation

### Requirement: Stat numbers animate with counting effect
Numeric stat displays (dashboard stats, KOL detail metrics, stock returns) SHALL animate from 0 to their final value with a counting effect on first render.

#### Scenario: Dashboard stats load
- **WHEN** the dashboard stats (KOL count, stock count, post count) load from the API
- **THEN** each number counts up from 0 to the final value over approximately 600ms

#### Scenario: Percentage values count up
- **WHEN** a win rate or return percentage renders
- **THEN** the number counts from 0% to the final value, including the decimal point

#### Scenario: Reduced motion preference
- **WHEN** the user has `prefers-reduced-motion: reduce` enabled
- **THEN** numbers display their final value immediately without counting animation

### Requirement: Action buttons provide visual feedback
Interactive actions (bookmark toggle, delete, save) SHALL provide immediate visual feedback via animation.

#### Scenario: Bookmark toggled on
- **WHEN** the user clicks the bookmark button to save a post
- **THEN** the bookmark icon animates with a brief scale-up pulse effect before settling to the filled state

#### Scenario: Delete action confirmed
- **WHEN** the user confirms a delete action
- **THEN** the deleted item fades out and collapses smoothly before being removed from the DOM

### Requirement: Skeleton-to-content transitions are smooth
Loading skeleton placeholders SHALL transition smoothly to actual content instead of abruptly swapping.

#### Scenario: Data finishes loading
- **WHEN** data loads and replaces skeleton placeholders
- **THEN** the content fades in smoothly (opacity transition over ~200ms) rather than appearing instantly

#### Scenario: Reduced motion preference
- **WHEN** the user has `prefers-reduced-motion: reduce` enabled
- **THEN** content appears immediately when data loads without fade transition
