## Why

Two visual issues surfaced after the `input-page-dashboard-layout` change shipped:

1. **Stepper placement.** The `<InputWizardStepper>` currently sits above the two-column grid as a full-width page header. Visually it reads as "this is the page's title bar," but it actually describes only what happens in the main (left) column — the right rail is a separate navigation dashboard. This disconnect makes the stepper feel detached from the action it's narrating.
2. **First-time hero is noisy and its cues are already covered.** The `<FirstTimeHero>` shaded card ("追蹤你的第一個 KOL") is shown to first-time users on `/input`. Its free-import badge (`首次完全免費`) is already re-surfaced at the moment-of-decision inside `<UrlDiscoveryList>` where credits are actually about to be spent, and its three hard-coded preset KOL buttons are a static onboarding hand-hold that would be better served by a dedicated tutorial flow later.

We want a cleaner, tighter `/input` landing that keeps the stepper bound to the left column and drops the hero entirely. A proper first-time tutorial is out of scope for this change and will be planned separately.

## What Changes

- **Move the wizard stepper inside the left (main) column** of `/input`, placed above the branching wizard content so it remains visible across all wizard states (idle, text, urls, profile).
- **Left-align the stepper** (`justify-start` instead of `justify-center`) so it hugs the column edge and behaves as a section header for the input panel below.
- **Remove `<FirstTimeHero>`** from `/input` entirely. Delete the `showFirstTimeHero` local variable and the `FirstTimeHero` import in `src/app/(app)/input/page.tsx`.
- **Delete the now-unused `src/components/scrape/first-time-hero.tsx`** component file.
- **Remove the `scrape.hero.*` i18n keys** from `src/messages/en/scrape.json` and `src/messages/zh-TW/scrape.json` (confirm no other consumers via grep before deleting).
- **Keep the existing page title** (`新增追蹤`) and description above the textarea — they anchor the page hierarchy and the `<h1>` for accessibility.
- **Preserve all wizard logic and branch handling**: only the stepper's DOM location and alignment change.

Out of scope:
- A replacement first-time tutorial or onboarding flow (tracked as a follow-up).
- Any wizard / detection / scrape behaviour changes.
- Any changes to the right-rail quick-nav cards.
- E2E test updates (deferred — only Vitest/snapshot updates if needed).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `input-page-layout` — stepper position + first-time hero removal

## Impact

- **Code**: `src/app/(app)/input/page.tsx`, `src/components/input/input-wizard-stepper.tsx` (alignment), delete `src/components/scrape/first-time-hero.tsx`, prune `src/messages/{en,zh-TW}/scrape.json` hero keys.
- **Data**: None. No API, DB, or hook changes.
- **Tests**: Update any Vitest tests that assert stepper DOM position or `FirstTimeHero` presence. No new unit tests required. E2E deferred.
- **Responsive**: No breakpoint changes. On mobile the stepper naturally flows inside the stacked main column, which is actually cleaner than the current behaviour.
- **Accessibility**: Page `<h1>` (`新增追蹤`) is preserved. Stepper retains its semantic structure.
