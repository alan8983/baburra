## Why

Baburra.io currently exposes three separate entry points for adding KOL content, which confuses new users and fragments the onboarding flow:

1. **`/input`** ("快速輸入") — paste free text to create a draft, or paste single post URLs for background import.
2. **`/import`** — already a redirect to `/input`, but still appears as a distinct mental model.
3. **`/scrape`** ("擷取 KOL") — paste a KOL **profile** URL, then discover → select → batch scrape posts.

All three flows start with the same action: "paste something into a textbox." The user should not need to know ahead of time whether what they are pasting is free text, a post URL, or a profile URL. A single smart input that auto-detects intent removes a decision point, collapses three sidebar items into one, and gives us one canonical "add content" surface to iterate on.

## What Changes

- **Extend `parseInputContent()`** in `src/lib/utils/parse-input-content.ts` to return three modes instead of two: `text`, `post-urls`, and `profile-url`. Reuse the `detectPlatform()` regex patterns from `src/components/scrape/profile-scrape-form.tsx` to distinguish profile URLs (e.g. `youtube.com/@handle`, `x.com/user`, `tiktok.com/@handle`, `facebook.com/user`, Spotify show / Apple Podcasts / direct RSS) from individual post URLs (`youtube.com/watch`, `x.com/user/status/...`).
- **Unify `/input` page** (`src/app/(app)/input/page.tsx`) to host all three flows behind a single `<Textarea>`. On submit, detection routes to:
  - `text` → existing `useQuickInput` → create draft (unchanged).
  - `post-urls` → existing `useBackgroundImport` (unchanged).
  - `profile-url` → the scrape flow (discover → select → scrape), ported inline.
- **Merge scrape state machine into `WizardState`**. Port the `input → discovering → selecting → processing → completed` machine from `src/app/(app)/scrape/page.tsx` into the input page as a third branch alongside `text` and `urls`. Reuse `UrlDiscoveryList` and `ScrapeProgress` components as-is.
- **Adapt `InputWizardStepper`** to render a dynamic step list. The profile-url branch adds an extra "select posts" step; the existing `text` and `urls` branches keep their current steps.
- **Show platform badge** below the textarea when a profile URL is detected, reusing the badge rendering from `ProfileScrapeForm`.
- **Move `FirstTimeHero`** (preset KOL chips) to the unified input page so new users land on a single "add content" surface.
- **Consolidate sidebar nav** in `src/lib/constants/routes.ts`: merge the three items (快速輸入 / 匯入 KOL / 擷取 KOL) into one entry, "新增內容", pointing at `/input`. Add a redirect from `/scrape` → `/input` (mirroring the existing `/import` redirect).
- **Relocate recent scrape jobs**. Move the recent scrape jobs list from the bottom of `/scrape` to the bottom of the unified `/input` page, shown only when the user has scrape history. (Simpler than moving to `/kols`; we can iterate later.)
- **i18n**: add any new keys needed for the unified page copy; existing `scrape.json` and `input.json` keys remain.

## Capabilities

### Modified Capabilities
- `input-wizard`: Accepts three detection modes and drives three flows from one textarea; stepper adapts per branch; hosts first-time hero and recent scrape jobs.
- `input-content-parser`: `parseInputContent()` now returns `{ mode: 'text' | 'post-urls' | 'profile-url', ... }` and surfaces the detected profile platform for profile URLs.
- `navigation`: Sidebar collapses three add-content entries into one; `/scrape` redirects to `/input`.

### Unchanged
- All backend APIs (`/api/scrape/*`, `/api/import/*`, `/api/quick-input`).
- All hooks (`useDiscoverProfile`, `useInitiateScrape`, `useBackgroundImport`, `useQuickInput`).
- Sub-components (`ScrapeProgress`, `UrlDiscoveryList`, `ImportResult`, `DetectedUrls`, `FirstTimeHero`) are reused as-is, only re-composed.

## Impact

- **Modified files**:
  - `src/lib/utils/parse-input-content.ts` — add `profile-url` mode and platform detection.
  - `src/app/(app)/input/page.tsx` — host all three flows; merge scrape state machine into `WizardState`.
  - `src/components/input/input-wizard-stepper.tsx` — dynamic step list per branch.
  - `src/app/(app)/scrape/page.tsx` — convert to redirect to `/input` (or delete after redirect wired).
  - `src/lib/constants/routes.ts` — consolidate nav items.
  - `src/messages/{zh-TW,en}/input.json` — new copy keys as needed.
- **Reused as-is**: `src/components/scrape/url-discovery-list.tsx`, `src/components/scrape/scrape-progress.tsx`, `src/components/scrape/profile-scrape-form.tsx` (platform detection helpers), `src/components/input/first-time-hero.tsx`, `src/components/input/detected-urls.tsx`, `src/components/input/import-result.tsx`.
- **No backend / DB changes**: all API routes, repositories, and schema remain untouched.
- **No new dependencies**.
- **User-visible**: sidebar goes from three "add content" items to one; `/scrape` bookmarks transparently redirect; the `/input` page gains a "select posts" step when a profile URL is pasted.
