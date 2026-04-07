## 1. Shared Platform Detection Helper

- [x] 1.1 Create `src/lib/utils/detect-profile-platform.ts` exporting `ProfilePlatform` type and `detectProfilePlatform(url: string): ProfilePlatform | null`. Port regex patterns from `ProfileScrapeForm.detectPlatform()` (YouTube `@handle`/`/channel/`/`/c/`, X/Twitter handle, TikTok `@handle`, Facebook handle, Spotify show, Apple Podcasts, direct RSS `.xml`/`.rss`).
- [x] 1.2 Add unit tests `src/lib/utils/__tests__/detect-profile-platform.test.ts` covering each platform pattern, post-URL non-matches (e.g. `youtube.com/watch`, `x.com/user/status/...`), and invalid inputs.
- [x] 1.3 Refactor `src/components/scrape/profile-scrape-form.tsx` to import from the new helper. Remove the inlined `detectPlatform()`.

## 2. Extend `parseInputContent()` to 3 Modes

- [x] 2.1 Update `src/lib/utils/parse-input-content.ts` to return a discriminated union with modes `text | post-urls | profile-url | empty`. Detection order: profile-url (single-URL + `detectProfilePlatform` match) → post-urls → text.
- [x] 2.2 Update tests with cases for all three modes, ordering edge cases (profile URL wins over post URL), mixed text + URL inputs.
- [x] 2.3 Update all call sites of `parseInputContent()` for the new `profile-url` mode and renamed `post-urls` mode (input page, detected-urls component).

## 3. Extend `WizardState` with `profile` Branch

- [x] 3.1 Rewrite `WizardState` in `src/app/(app)/input/page.tsx` as a discriminated union `idle | text | urls | profile`, each branch owning its own step sub-type.
- [x] 3.2 Add transitions for the profile branch: discover → select → initiate → progress → complete. Existing text and urls transitions preserved.

## 4. Unified `/input` Page Composition

- [x] 4.1 Route submit by detected mode (text / post-urls / profile-url) to the appropriate hook.
- [x] 4.2 Render profile-url affordances inline: platform badge, `UrlDiscoveryList`, `ScrapeProgress`, completion card.
- [x] 4.3 Wire `useInitiateScrape` on `UrlDiscoveryList` confirm → transition to `profile/processing` with returned `jobId`.
- [x] 4.4 `FirstTimeHero` renders on idle state; preset chips prefill the textarea and detect as `profile-url` on submit.

## 5. Adapt `InputWizardStepper`

- [x] 5.1 Dynamic step list by branch (`idle` / `text` / `post-urls` / `profile`), with the profile branch exposing a 5-step sequence.
- [x] 5.2 Visual verification at mobile/tablet/desktop breakpoints — verified on local preview; stepper shows 4-step idle sequence at all sizes (horizontally scrollable on mobile).

## 6. Recent Scrape Jobs Relocation

- [x] 6.1 Extract the recent scrape jobs list into `src/components/scrape/recent-scrape-jobs.tsx` (uses `useScrapeJobs` internally, renders nothing when empty).
- [x] 6.2 Render `<RecentScrapeJobs />` at the bottom of `src/app/(app)/input/page.tsx`.

## 7. Redirect `/scrape` → `/input` and Consolidate Nav

- [x] 7.1 Replace `src/app/(app)/scrape/page.tsx` with a server-side `redirect(ROUTES.INPUT)`.
- [x] 7.2 Update `src/lib/constants/routes.ts` nav array: remove 匯入 KOL and 擷取 KOL entries, rename 快速輸入 → 新增內容.
- [x] 7.3 Update hardcoded `/scrape` nav entries in `sidebar.tsx`, `mobile-nav.tsx`, and the subscriptions empty-state CTA.

## 8. i18n

- [x] 8.1 Add new wizard/detection/action keys (`wizard.discovering`, `wizard.selecting`, `detection.modeProfile`, `actions.discoverProfile`) to both `zh-TW/input.json` and `en/input.json`.
- [x] 8.2 Unused keys sweep — deleted dead `profile-scrape-form.tsx` + `scrape-flow-chart.tsx`, pruned unused `title`/`description`/`form`/`flowChart`/`errors` groups and stray keys (`queue.estimatedWait`, `progress.earlyNudge`, `progress.viewKolEarly`, `progress.stats`, `progress.processed`, `jobs.empty`, `discover.title`, `discover.loading`, `notifications.dismiss`) from both `scrape.json` locales.

## 9. Validation

- [x] 9.1 `npm run type-check` — passes with no errors.
- [x] 9.2 `npm run lint` — no new errors (pre-existing warnings untouched).
- [x] 9.3 `npm test` — 749 tests passing including new detect-profile-platform and profile-url parser cases.
- [x] 9.4 Manual smoke test on `/input` — verified all three flows detect correctly: text input → "建立草稿" button, post URLs → "匯入文章" button, profile URL (`youtube.com/@Gooaye`) → YouTube badge + "探索 KOL 內容" button. Recent scrape jobs list renders at the bottom.
- [ ] 9.5 `npm run test:e2e` (pending — not run in this session).
