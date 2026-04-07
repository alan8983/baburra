## Context

Three entry points exist today: `/input` (quick-input: text → draft, or post URLs → background import), `/import` (already redirects to `/input`), and `/scrape` (profile URL → discover → select → batch scrape). They share the same affordance — "paste something" — but force the user to decide upfront which mental model to use.

The input wizard (`src/app/(app)/input/page.tsx`) has a `WizardState` driven by `parseInputContent()` returning a two-mode union (`text` | `urls`). The scrape page (`src/app/(app)/scrape/page.tsx`) runs an independent state machine (`input → discovering → selecting → processing → completed`), uses `useDiscoverProfile` and `useInitiateScrape`, and reuses `ProfileScrapeForm` / `UrlDiscoveryList` / `ScrapeProgress`.

All the plumbing (APIs, hooks, sub-components) is already in place. The missing piece is a single composition that auto-detects intent and hosts all three flows on `/input`.

## Goals / Non-Goals

**Goals:**
- One textarea on `/input` drives all three flows (text, post URLs, profile URL).
- Detection is purely client-side, using existing regex patterns.
- Sidebar collapses from three "add content" entries to one.
- `/scrape` transparently redirects to `/input`.
- Reuse `UrlDiscoveryList`, `ScrapeProgress`, `FirstTimeHero`, etc. unchanged.

**Non-Goals:**
- No backend API changes.
- No changes to `useDiscoverProfile`, `useInitiateScrape`, `useBackgroundImport`, `useQuickInput`.
- No new extractors, repositories, or DB migrations.
- No redesign of `UrlDiscoveryList` or `ScrapeProgress` internals.
- No change to i18n locale strategy (existing `scrape.json` and `input.json` keys remain).

## Decisions

### D1: Extend `parseInputContent()` with a third `profile-url` mode

**Decision**: `parseInputContent(raw: string)` returns a discriminated union with three modes:

```ts
type ParsedInput =
  | { mode: 'text'; text: string }
  | { mode: 'post-urls'; urls: string[] }
  | { mode: 'profile-url'; url: string; platform: 'youtube' | 'twitter' | 'tiktok' | 'facebook' | 'podcast' };
```

Detection order (first match wins):
1. If the trimmed input is a single URL AND matches any profile pattern (`youtube.com/@`, `/channel/`, `/c/`, `x.com/{handle}`, `twitter.com/{handle}`, `tiktok.com/@`, `facebook.com/{handle}`, Spotify show, Apple Podcasts, direct RSS `.xml`/`.rss`) → `profile-url`.
2. Else if the input contains one or more post URLs (`youtube.com/watch`, `youtu.be/`, `x.com/{handle}/status/`, etc.) → `post-urls`.
3. Else → `text`.

**Rationale**: Profile URLs are a strict subset of "single URL" inputs, so they must be checked before the generic post-URL path. Platform patterns already exist in `src/components/scrape/profile-scrape-form.tsx`'s `detectPlatform()` — extract them into a shared helper (`src/lib/utils/detect-profile-platform.ts`) and reuse from both the parser and the form. This keeps the client component free of server-only deps, mirroring the pattern used in BUG-001 from the podcast-rss-extractor change.

**Alternative considered**: Keep `detectPlatform()` inlined in the form and duplicate patterns in the parser. Rejected — drift risk.

### D2: Merge the scrape state machine into `WizardState` as a third branch

**Decision**: Extend `WizardState` in `src/app/(app)/input/page.tsx` to host the scrape flow as a parallel branch:

```
WizardState =
  | { kind: 'idle' }
  | { kind: 'text'; step: 'review' | 'submitting' | 'done' }
  | { kind: 'urls'; step: 'review' | 'importing' | 'done' }
  | { kind: 'profile'; step: 'discovering' | 'selecting' | 'processing' | 'completed'; platform: Platform; profileUrl: string; discoveryResult?: ProfileDiscovery; jobId?: string }
```

The `profile` branch mirrors the existing scrape page state machine 1:1. Transitions:
- `idle` → paste profile URL → submit → `profile/discovering` (calls `useDiscoverProfile`)
- `discovering` → result → `profile/selecting` (renders `UrlDiscoveryList` inline)
- `selecting` → confirm selection → `profile/processing` (calls `useInitiateScrape`, renders `ScrapeProgress`)
- `processing` → job done → `profile/completed` (shows summary + CTA to view posts)

**Rationale**: A single `WizardState` keeps the page's reducer coherent and lets `InputWizardStepper` render a dynamic step list from one source of truth. The existing `text` and `urls` branches are unaffected.

**Alternative considered**: Keep three separate state atoms (one per flow). Rejected — harder to reason about, and `InputWizardStepper` would need to read from three sources.

### D3: Dynamic `InputWizardStepper` step list per branch

**Decision**: `InputWizardStepper` accepts the current `WizardState` and returns the steps for the active branch:

| Branch | Steps |
|---|---|
| `text` | 輸入內容 → 檢視 → 儲存草稿 |
| `urls` | 輸入內容 → 確認 URL → 匯入 |
| `profile` | 輸入內容 → 發現貼文 → 選擇貼文 → 擷取中 → 完成 |

Idle state shows the generic first step ("輸入內容") with subsequent steps greyed out.

**Rationale**: The stepper is purely presentational today; this change keeps it so. No new props beyond the `WizardState` it already receives.

### D4: `/scrape` becomes a redirect, `/input` becomes the canonical surface

**Decision**:
- Replace the body of `src/app/(app)/scrape/page.tsx` with `redirect(ROUTES.INPUT)` (Next.js server redirect), mirroring how `/import` already redirects.
- Delete the scrape page's now-unused state machine wiring (the logic has moved into `/input/page.tsx`).
- Update the nav array in `src/lib/constants/routes.ts`: drop the 匯入 KOL and 擷取 KOL entries, rename 快速輸入 to 新增內容 (label only — the route stays `/input`).

**Rationale**: Redirect (rather than delete the route) preserves bookmarks. Keeping `/input` as the route URL means existing deep-links and tests stay valid.

### D5: Recent scrape jobs go to the bottom of `/input`

**Decision**: Move the recent scrape jobs list from `/scrape`'s bottom section to the bottom of `/input`, shown only when the user has scrape history (same conditional as today). The component itself is reused as-is.

**Rationale**: Simpler than relocating to `/kols` (which would need a new data hook placement and a different empty state). The unified input page is the logical home because that's where new jobs are initiated. We can revisit moving it to `/kols` later.

### D6: `FirstTimeHero` on the unified page

**Decision**: Render `FirstTimeHero` above the textarea when `WizardState.kind === 'idle'` AND the textarea is empty AND the user has no existing content (same heuristic as today). The preset KOL chips, when clicked, prefill the textarea with a profile URL, which then detects as `profile-url` on submit — no special casing needed.

**Rationale**: Reuses the existing component unchanged. The chips already produce profile URLs, so they naturally route through the new `profile` branch.

## Component Design

### Unified `/input` page composition

```
InputPage
├── FirstTimeHero                    (idle + empty + no content)
├── InputWizardStepper                (reads WizardState → renders dynamic steps)
├── <Textarea>                        (bound to raw input)
├── PlatformBadge                     (profile-url detected → platform badge)
├── DetectedUrls                      (post-urls detected → preview list)
├── Submit button                     (label varies by detected mode)
│
├── [profile branch] UrlDiscoveryList (state: selecting)
├── [profile branch] ScrapeProgress   (state: processing)
├── [profile branch] completion card  (state: completed)
│
├── [urls branch] ImportResult        (state: done)
├── [text branch] draft success card  (state: done)
│
└── RecentScrapeJobs                  (if user has history)
```

### Shared helper: `detectProfilePlatform()`

```ts
// src/lib/utils/detect-profile-platform.ts
export type ProfilePlatform = 'youtube' | 'twitter' | 'tiktok' | 'facebook' | 'podcast';

export function detectProfilePlatform(url: string): ProfilePlatform | null;
```

Extracts the regex patterns currently inlined in `ProfileScrapeForm.detectPlatform()`. `ProfileScrapeForm` and `parseInputContent()` both import from here.

### Data flow

```
User pastes into textarea
  → onChange: parseInputContent(raw) → detected mode
  → render mode-specific affordances (badge / detected-urls / none)
  → Submit:
    ├── text       → useQuickInput.mutate() → draft success
    ├── post-urls  → useBackgroundImport.start() → ImportResult
    └── profile-url → useDiscoverProfile.mutate()
                      → set state: profile/selecting + discoveryResult
                      → user selects → useInitiateScrape.mutate()
                      → set state: profile/processing + jobId
                      → poll job → profile/completed
```

## Risks

- **State machine complexity**: adding a third branch to `WizardState` grows the reducer. Mitigation: each branch is isolated — transitions in `profile` never touch `text`/`urls` state.
- **Regex drift**: two places used to detect platforms (`profile-scrape-form.tsx` and the parser). Mitigation: D1 extracts the single source of truth into `detect-profile-platform.ts`.
- **Stepper visual regressions**: dynamic step list changes the stepper's layout in the `profile` branch (5 steps vs 3). Mitigation: verify visually at all breakpoints; the stepper is already horizontally scrollable on narrow screens.
- **Deleting `/scrape` route body**: any in-progress scrape job running on `/scrape` would be interrupted if a user is mid-flow during deploy. Acceptable — jobs run server-side and resume via job polling on `/input`.

## Migration

No data migration. Code-only change:
1. Extract `detectProfilePlatform()` helper.
2. Extend `parseInputContent()` to 3-mode union.
3. Rewrite `/input/page.tsx` to host all three branches.
4. Replace `/scrape/page.tsx` body with redirect.
5. Update `routes.ts` nav array.
6. Move recent scrape jobs component into `/input`.
