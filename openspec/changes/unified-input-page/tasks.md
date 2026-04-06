## 1. Shared Platform Detection Helper

- [x] 1.1 Create `src/lib/utils/detect-profile-platform.ts` exporting `ProfilePlatform` type and `detectProfilePlatform(url: string): ProfilePlatform | null`. Port regex patterns from `ProfileScrapeForm.detectPlatform()` (YouTube `@handle`/`/channel/`/`/c/`, X/Twitter handle, TikTok `@handle`, Facebook handle, Spotify show, Apple Podcasts, direct RSS `.xml`/`.rss`).
- [x] 1.2 Add unit tests `src/lib/utils/__tests__/detect-profile-platform.test.ts` covering each platform pattern, post-URL non-matches (e.g. `youtube.com/watch`, `x.com/user/status/...`), and invalid inputs.
- [x] 1.3 Refactor `src/components/scrape/profile-scrape-form.tsx` to import from the new helper. Remove the inlined `detectPlatform()`.

## 2. Extend `parseInputContent()` to 3 Modes

- [ ] 2.1 Update `src/lib/utils/parse-input-content.ts` to return a discriminated union: `{ mode: 'text' | 'post-urls' | 'profile-url', ... }`. Detection order: profile-url (single-URL + `detectProfilePlatform` match) → post-urls → text.
- [ ] 2.2 Update `src/lib/utils/parse-input-content.test.ts` (or create) with cases for all three modes, ordering edge cases (profile URL wins over post URL), mixed text + URL inputs.
- [ ] 2.3 Update any call sites of `parseInputContent()` to handle the new `profile-url` mode (expect only `src/app/(app)/input/page.tsx` — verify with grep).

## 3. Extend `WizardState` with `profile` Branch

- [ ] 3.1 In `src/app/(app)/input/page.tsx`, extend `WizardState` to include `{ kind: 'profile'; step: 'discovering' | 'selecting' | 'processing' | 'completed'; platform; profileUrl; discoveryResult?; jobId? }`.
- [ ] 3.2 Add reducer actions / setState transitions for the profile branch: `START_DISCOVER`, `DISCOVER_SUCCESS`, `SELECT_POSTS`, `START_SCRAPE`, `SCRAPE_COMPLETE`, `RESET`. Keep existing `text` and `urls` transitions untouched.

## 4. Unified `/input` Page Composition

- [ ] 4.1 Update `src/app/(app)/input/page.tsx` to route submit by detected mode:
  - `text` → existing `useQuickInput` path (unchanged).
  - `post-urls` → existing `useBackgroundImport` path (unchanged).
  - `profile-url` → `useDiscoverProfile.mutate()` → state `profile/discovering`.
- [ ] 4.2 Render profile-url affordances inline:
  - Platform badge below textarea when `profile-url` detected (reuse badge JSX from `ProfileScrapeForm`).
  - `UrlDiscoveryList` during `profile/selecting` (import from `src/components/scrape/url-discovery-list.tsx`).
  - `ScrapeProgress` during `profile/processing` (import from `src/components/scrape/scrape-progress.tsx`).
  - Completion card during `profile/completed` with CTA to view posts.
- [ ] 4.3 Wire `useInitiateScrape` on `UrlDiscoveryList` confirm → transition to `profile/processing` with the returned `jobId`.
- [ ] 4.4 Ensure `FirstTimeHero` still renders when `WizardState.kind === 'idle'` and the existing first-time heuristic holds. Verify preset KOL chips prefill the textarea and detect as `profile-url`.

## 5. Adapt `InputWizardStepper`

- [ ] 5.1 Update `src/components/input/input-wizard-stepper.tsx` to compute step list dynamically from `WizardState.kind`:
  - `text`: 輸入內容 → 檢視 → 儲存草稿
  - `urls`: 輸入內容 → 確認 URL → 匯入
  - `profile`: 輸入內容 → 發現貼文 → 選擇貼文 → 擷取中 → 完成
  - `idle`: show generic 輸入內容 + greyed subsequent steps.
- [ ] 5.2 Verify stepper layout at mobile/tablet/desktop breakpoints (visual check — no automated test).

## 6. Recent Scrape Jobs Relocation

- [ ] 6.1 Identify the recent scrape jobs list component currently rendered at the bottom of `src/app/(app)/scrape/page.tsx`. Extract into a reusable component if not already one.
- [ ] 6.2 Render it at the bottom of `src/app/(app)/input/page.tsx`, conditional on the user having scrape history (same condition as today).

## 7. Redirect `/scrape` → `/input` and Consolidate Nav

- [ ] 7.1 Replace the body of `src/app/(app)/scrape/page.tsx` with a server-side `redirect(ROUTES.INPUT)`, mirroring how `/import` redirects. Remove unused imports and state logic from this file.
- [ ] 7.2 Update `src/lib/constants/routes.ts` nav array: remove 匯入 KOL and 擷取 KOL entries; rename 快速輸入 to 新增內容 (route stays `/input`). Keep `ROUTES.SCRAPE` constant for the redirect source if still referenced, otherwise delete.
- [ ] 7.3 Grep for `/scrape` hardcoded links across `src/` and update any that should now point to `/input` (the redirect catches the rest, but direct links should be updated).

## 8. i18n

- [ ] 8.1 Add any new copy keys needed for the unified page (e.g. new sidebar label 新增內容, stepper labels for the profile branch if not already in `scrape.json`). Update both `src/messages/zh-TW/input.json` and `src/messages/en/input.json`.
- [ ] 8.2 Verify no unused keys remain in `input.json`/`scrape.json` after consolidation (leave `scrape.json` as-is since its keys are still used by the relocated components).

## 9. Validation

- [ ] 9.1 `npm run type-check` — all type changes compile.
- [ ] 9.2 `npm run lint` — no new lint errors.
- [ ] 9.3 `npm test` — unit tests pass, including new `detect-profile-platform` and `parse-input-content` cases.
- [ ] 9.4 Manual smoke test on `/input`:
  - Paste free text → draft created.
  - Paste a single YouTube `watch` URL → background import runs.
  - Paste multiple post URLs (mixed platforms) → background import runs.
  - Paste a YouTube `@handle` profile URL → platform badge shows, discover runs, `UrlDiscoveryList` appears, selecting posts initiates scrape, `ScrapeProgress` renders, completion card shows.
  - Repeat profile URL test for X, TikTok, Facebook, Spotify show, direct RSS.
  - Visit `/scrape` → redirects to `/input`.
  - Sidebar shows a single 新增內容 entry.
  - Recent scrape jobs list renders at the bottom when history exists.
- [ ] 9.5 `npm run test:e2e` — existing E2E suite still passes (update selectors if any target `/scrape`-specific elements that have moved).
