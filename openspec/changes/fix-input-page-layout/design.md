## Context

The `input-page-dashboard-layout` change (archived) converted `/input` to a two-column grid: a main column (left, `lg:col-span-2`) hosting the smart-input wizard + recent scrape jobs, and a right rail (`lg:col-span-1`) hosting `<InputPageQuickNav>`. In that layout, the `<InputWizardStepper>` was placed **outside** the grid as a full-width page-level element (`src/app/(app)/input/page.tsx:274`).

In parallel, the archived `first-user-hero-banner` change introduced `<FirstTimeHero>` on `/scrape`, and the `unified-input-page` change started rendering it on `/input` for first-time users as the top of the smart-input card.

Both decisions made sense at the time but the combined result on `/input` today is:
- A stepper that visually sits as a page header but only describes the left column's flow.
- A shaded hero card that duplicates the free-import signal (already re-surfaced in `<UrlDiscoveryList>`) and hard-codes three preset KOL buttons that should belong to a proper tutorial flow.

This change addresses both without introducing new product surface. A better first-time tutorial is planned as a follow-up and is deliberately out of scope here.

## Goals / Non-Goals

**Goals:**
- Stepper visually anchored to the left (main) column as its section header.
- Stepper remains visible across all wizard branches (idle, text, post-urls, profile).
- Cleaner first-time experience: no shaded onboarding card on `/input`.
- Zero regressions to wizard logic, detection, scrape flows, or the right rail.

**Non-Goals:**
- Building a replacement first-time tutorial / onboarding flow.
- Changing the 2/3 : 1/3 grid split or responsive breakpoints.
- Changing the page title, description copy, or textarea behaviour.
- Updating E2E tests (deferred).

## Decisions

**Decision 1 — Nest the stepper inside `lg:col-span-2`, above the wizard-state switch.**

Current placement:
```
<div max-w-6xl space-y-8>
  <InputWizardStepper />          ← here, outside the grid
  <div grid lg:grid-cols-3>
    <div lg:col-span-2>
      {showInputPane && …}
      {wizard.kind === 'text' && …}
      {wizard.kind === 'profile' && …}
      <RecentScrapeJobs />
    </div>
    <aside lg:col-span-1>
      <InputPageQuickNav />
    </aside>
  </div>
</div>
```

New placement:
```
<div max-w-6xl>
  <div grid lg:grid-cols-3 gap-6>
    <div lg:col-span-2 space-y-8>
      <InputWizardStepper />       ← moved inside main column
      {showInputPane && …}
      {wizard.kind === 'text' && …}
      {wizard.kind === 'profile' && …}
      <RecentScrapeJobs />
    </div>
    <aside lg:col-span-1>
      <InputPageQuickNav />
    </aside>
  </div>
</div>
```

Critical detail: the stepper must live **outside** the `{showInputPane && …}` conditional and **above** all wizard-branch JSX blocks, so it stays visible through every wizard state. If it were placed inside `showInputPane`, it would disappear the moment the user submits text or a URL, which is exactly when the stepper is most informative.

_Alternative A_: Keep stepper above the grid but constrain its max-width to 2/3 via its own internal `max-w-2xl mx-0`. Rejected — fights the grid and produces fragile alignment.

_Alternative B_: Duplicate the stepper inside each wizard-branch block. Rejected — DRY violation and easy to drift.

**Decision 2 — Left-align the stepper (`justify-start`) instead of `justify-center`.**

Once the stepper is inside a 2/3-wide column where the title, description, and textarea all left-align, centering the stepper produces awkward whitespace and misalignment. Left-aligning makes it read as a section header.

Since `<InputWizardStepper>` currently hard-codes `justify-center` (`src/components/input/input-wizard-stepper.tsx:46`) and the `/input` page is its only consumer, we can simply change the default to `justify-start`. No prop plumbing needed.

_Alternative_: Add an `align?: 'start' | 'center'` prop. Rejected — speculative flexibility; only one consumer today.

**Decision 3 — Delete `<FirstTimeHero>` rather than hide it or refactor it.**

`<FirstTimeHero>` currently carries three payloads:
| Payload | Replacement |
|---|---|
| Target icon + "追蹤你的第一個 KOL" framing | None — accept cold start |
| 🎁 Free-import badge | Already re-surfaced in `<UrlDiscoveryList>` credit footer via `firstImportFree={isFirstTimeUser}` (`page.tsx:416`) |
| 3 hard-coded preset buttons (股癌/柴鼠/財報狗) | None — deferred to a future tutorial flow |

The component is only imported by `src/app/(app)/input/page.tsx` (verified by grep). Removing the import, call site, and component file is a clean delete. A future tutorial flow will not re-use this component — it will want a different surface (possibly a modal, product tour, or dedicated `/welcome` route), so keeping the file "just in case" adds cruft.

_Alternative_: Hide the hero behind a feature flag. Rejected — we have no active flag system for UI and the cleanest reversal is a `git revert` if we change our minds.

**Decision 4 — Prune `scrape.hero.*` i18n keys after verifying no other consumers.**

Before deleting, grep `scrape.hero` across the codebase. If the only reference is the deleted component, remove the keys from both locale files. If any other code references them (unlikely), leave the keys and note it in the PR.

**Decision 5 — Preserve the page title + description.**

Considered dropping the title `新增追蹤` since the stepper already labels step 1 as `輸入`. Rejected because:
- The stepper labels a *step*, the title labels a *page*. Different semantic roles.
- After the hero is removed, the left column gets sparse; the title + description provide minimal welcoming structure without re-introducing a shaded box.
- Removing the `<h1>` would leave the page without a primary heading (accessibility regression).

## Risks / Trade-offs

- **[Risk]** Cold start for true first-time users (zero KOLs, zero stocks). They now see an empty textarea, empty right-rail KOL/Stocks cards, and no preset hand-holds.
  **Mitigation**: Accept this for now; the user has explicitly said a better tutorial is the follow-up. Empty-state copy in `InputPageQuickNav` still provides minimal orientation, and the textarea placeholder + footer hint describe what to paste.

- **[Risk]** Someone else is importing `first-time-hero.tsx` that grep missed (dynamic import, string-built path).
  **Mitigation**: Run `grep -r "first-time-hero\|FirstTimeHero"` before deletion; if any match outside the files we're editing, pause and reassess.

- **[Risk]** Changing `justify-center` → `justify-start` affects a shared component, even though `/input` is the only caller today.
  **Mitigation**: Grep `InputWizardStepper` usage before editing. Current expectation (from dashboard-layout change history): `/input/page.tsx` is the sole consumer.

- **[Trade-off]** The 5-step profile branch stepper in a 2/3-width column may feel tight on mid-size laptops (~1280px viewport). Accepted — left-alignment helps since steps can overflow to the right without needing to re-center.

- **[Trade-off]** Deleting `scrape.hero.*` keys is a one-way door; restoring them means a new translation task. Since the hero is gone and the preset KOL names are hard-coded in translation files (not a live catalog), the data has low restoration cost.
