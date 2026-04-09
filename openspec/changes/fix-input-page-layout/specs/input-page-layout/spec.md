## MODIFIED Requirements

### Requirement: Wizard stepper placement on the input page

The `/input` page SHALL render the `<InputWizardStepper>` **inside the main (left) column** of the two-column layout, above all wizard-state content, and left-aligned. The stepper SHALL remain visible across every wizard branch (idle, text, post-urls, profile) and every step within those branches. The stepper SHALL NOT render as a full-width page-level header above the grid.

#### Scenario: Stepper visible on idle state
- **WHEN** a user lands on `/input` with no wizard activity
- **THEN** the stepper renders at the top of the left column, left-aligned, showing step 1 (`輸入`) as current

#### Scenario: Stepper visible during text processing
- **WHEN** a user submits free-text content and the wizard enters `{ kind: 'text', step: 'processing' }`
- **THEN** the stepper is still visible at the top of the left column, showing step 2 (`處理中`) as current

#### Scenario: Stepper visible across the profile-URL branch
- **WHEN** a user pastes a profile URL and the wizard transitions through `discovering` → `selecting` → `processing` → `completed`
- **THEN** the stepper updates its current-step indicator at each transition, remains visible at the top of the left column, and reflects the 5-step profile sequence (`input` → `discovering` → `selecting` → `processing` → `complete`)

#### Scenario: Left-aligned inside narrower column
- **WHEN** the stepper renders inside the `lg:col-span-2` main column
- **THEN** its flex container uses `justify-start` so steps anchor to the left edge of the column

#### Scenario: Right rail unaffected
- **WHEN** the stepper is placed inside the main column
- **THEN** the right rail (`<InputPageQuickNav>`) starts at the top of its own column with no stepper overhead

## REMOVED Requirements

### Requirement: First-time hero banner on the input page

**Reason**: The `<FirstTimeHero>` shaded onboarding card on `/input` duplicated the free-import signal (already surfaced in `<UrlDiscoveryList>` at the moment credits are spent) and hard-coded three preset KOL buttons. A dedicated first-time tutorial flow will replace it in a separate follow-up change.

**Migration**: The component file `src/components/scrape/first-time-hero.tsx` is deleted. Its `scrape.hero.*` i18n keys are removed from `src/messages/en/scrape.json` and `src/messages/zh-TW/scrape.json`. First-time users still receive the free-import badge via `<UrlDiscoveryList>` during the scrape flow (`firstImportFree={isFirstTimeUser}`).
