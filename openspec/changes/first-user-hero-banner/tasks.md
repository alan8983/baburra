## 1. Expose `first_import_free` in Profile API

- [x] 1.1 In `profile.repository.ts`: add `first_import_free` to `getProfile()` SELECT clause and return `firstImportFree: data.first_import_free === true`
- [x] 1.2 In `use-profile.ts`: add `firstImportFree: boolean` to `ProfileData` interface
- [x] 1.3 Verify with `npm run type-check` that types compile

## 2. Add i18n Strings

- [x] 2.1 In `src/messages/zh-TW/scrape.json`: add `hero.title`, `hero.subtitle`, `hero.freeBadge`, `hero.presetHint`, `hero.presets` (array of 3 KOL name/URL pairs), and `discover.firstImportFree` key
- [x] 2.2 In `src/messages/en/scrape.json`: add matching English keys

## 3. Create First-Time Hero Banner Component

- [x] 3.1 Create `src/components/scrape/first-time-hero.tsx` with props `{ onSelectPreset: (url: string) => void }`. Renders: heading, subtitle, free badge, and 3 preset KOL buttons from i18n. Uses shadcn Card + Button + Badge.

## 4. Wire Hero Banner into Scrape Page

- [x] 4.1 In `profile-scrape-form.tsx`: add optional `initialUrl?: string` prop, use it as default value for the URL input field
- [x] 4.2 In `scrape/page.tsx`: import `useProfile`, conditionally render `<FirstTimeHero>` above the flow chart when `firstImportFree === true` and `state === 'input'`. On preset click, set a `presetUrl` state and pass as `initialUrl` to `ProfileScrapeForm`.

## 5. Add Free Badge to URL Discovery List

- [x] 5.1 In `url-discovery-list.tsx`: add `firstImportFree?: boolean` prop. When true, show a green "first import free" badge inside the credit estimation footer and override `insufficientCredits` to `false`.
- [x] 5.2 In `scrape/page.tsx`: pass `firstImportFree` prop to `<UrlDiscoveryList>` from profile data.

## 6. Change Middleware Redirect

- [x] 6.1 In `middleware.ts`: change the two occurrences of `'/input'` redirect to `'/scrape'` (line 87 for `/` → authed redirect, line 96 for login/register → authed redirect)

## 7. Verification

- [x] 7.1 Run `npm run type-check`
- [x] 7.2 Run `npm test`
- [x] 7.3 Run `npm run build`
- [x] 7.4 Manual smoke test: verify hero banner appears on scrape page, preset buttons pre-fill URL, free badge shows in step 2, middleware redirects to `/scrape`
