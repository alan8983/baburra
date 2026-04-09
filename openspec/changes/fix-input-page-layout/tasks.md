## 1. Pre-flight Checks

- [x] 1.1 Grep `FirstTimeHero` and `first-time-hero` across `src/` to confirm `src/app/(app)/input/page.tsx` is the only consumer.
- [x] 1.2 Grep `InputWizardStepper` across `src/` to confirm `src/app/(app)/input/page.tsx` is the only consumer.
- [x] 1.3 Grep `scrape.hero` across `src/messages/` and `src/` to confirm no other code references the hero i18n keys.

## 2. Move the Wizard Stepper

- [x] 2.1 In `src/app/(app)/input/page.tsx`, remove `<InputWizardStepper>` from its current location (currently above the grid, inside the `max-w-6xl space-y-8` wrapper).
- [x] 2.2 Re-insert `<InputWizardStepper>` inside `lg:col-span-2`, as the **first child** of the main column, above all wizard-state conditional blocks (`{showInputPane && …}`, `{wizard.kind === 'text' && …}`, `{wizard.kind === 'profile' && …}`). Ensure it stays visible across every wizard branch, not only in idle.
- [x] 2.3 Remove the now-unnecessary `space-y-8` from the outer `max-w-6xl` wrapper if it was only there to separate the stepper from the grid; add `space-y-8` to the `lg:col-span-2` container instead to preserve vertical rhythm inside the main column.
- [x] 2.4 In `src/components/input/input-wizard-stepper.tsx`, change the root flex container from `justify-center` to `justify-start` (single occurrence on line 46).

## 3. Remove the First-Time Hero

- [x] 3.1 In `src/app/(app)/input/page.tsx`, delete the `showFirstTimeHero` local variable (currently on line 269).
- [x] 3.2 Delete the `<FirstTimeHero>` render call from the `showInputPane` block (currently on line 285).
- [x] 3.3 Remove the `import { FirstTimeHero } from '@/components/scrape/first-time-hero'` line from the imports at the top of the file.
- [x] 3.4 Delete the file `src/components/scrape/first-time-hero.tsx`.
- [x] 3.5 Remove the `hero` object (all `hero.*` keys) from `src/messages/en/scrape.json`.
- [x] 3.6 Remove the `hero` object (all `hero.*` keys) from `src/messages/zh-TW/scrape.json`.

## 4. Clean-up & Adjacent Fixes

- [x] 4.1 If `isFirstTimeUser` is now only used for the wizard's first-time free badge in `<UrlDiscoveryList>`, leave it; otherwise remove any unused branches. Do NOT remove the `useProfile()` call since `isFirstTimeUser` is still passed into `UrlDiscoveryList`.
- [x] 4.2 Verify that the page title (`t('title')`) and description (`t('description')`) are still rendered at the top of the `showInputPane` block, unchanged.
- [x] 4.3 Verify the right-rail `<InputPageQuickNav>` is untouched (no regressions to Dashboard / KOLs / Stocks cards).

## 5. Tests

- [x] 5.1 Update any Vitest / snapshot tests that reference `FirstTimeHero`, the hero banner text, or the stepper's DOM position relative to the grid. Search: `first-time-hero`, `FirstTimeHero`, `scrape.hero`, `追蹤你的第一個`. _(None found — no updates needed.)_
- [x] 5.2 Do NOT add new unit tests for the layout move itself — it's a pure JSX rearrangement covered by type-check + manual preview.

## 6. Validation

- [x] 6.1 `npm run type-check` passes (no dangling imports or unused variables).
- [x] 6.2 `npm run lint` passes (no new warnings). _(0 errors; 26 pre-existing warnings in unrelated files.)_
- [x] 6.3 `npm test` passes (including any tests updated in §5.1). _(43 files / 755 tests passed.)_
- [ ] 6.4 Manual preview at desktop (≥1280px): stepper sits above the textarea inside the left column, left-aligned; right rail is unchanged; no shaded hero card renders for first-time users.
- [ ] 6.5 Manual preview at tablet (≈768px) and mobile (≈375px): columns collapse, stepper flows at the top of the stacked main column, no visual regressions.
- [ ] 6.6 Manual preview through a profile-URL wizard flow (`discovering` → `selecting` → `processing` → `completed`): confirm the stepper remains visible and updates its current-step indicator across every branch.

## 7. Follow-ups (not in this change)

- [ ] 7.1 Design and propose a replacement first-time tutorial / onboarding flow as a separate change.
