## Pre-flight

- [ ] All tasks in tasks.md marked `[x]`
- [ ] `npm run type-check` passes
- [ ] `npx vitest run` passes

## Change-Specific Tests

### V-001: Profile API returns `firstImportFree` field
- **method**: api
- **severity**: critical
- **endpoint**: GET /api/profile
- **expected**: Response JSON includes `firstImportFree` as a boolean field
- **steps**:
  1. `curl http://localhost:3000/api/profile`
  2. Verify response contains `"firstImportFree"` key with boolean value

### V-002: Profile repository selects `first_import_free` from DB
- **method**: static
- **severity**: critical
- **expected**: `profile.repository.ts` `getProfile()` includes `first_import_free` in SELECT and maps to `firstImportFree`
- **steps**:
  1. Grep for `first_import_free` in `profile.repository.ts`
  2. Verify SELECT clause and return mapping

### V-003: `useProfile` hook exposes `firstImportFree` in `ProfileData` type
- **method**: static
- **severity**: critical
- **expected**: `ProfileData` interface in `use-profile.ts` includes `firstImportFree: boolean`
- **steps**:
  1. Read `use-profile.ts` and verify the type

### V-004: FirstTimeHero component renders with i18n strings
- **method**: static
- **severity**: high
- **expected**: Component imports from `next-intl`, uses `scrape.hero.*` translation keys, renders 3 preset KOL buttons
- **steps**:
  1. Read `first-time-hero.tsx`
  2. Verify i18n key usage and preset button rendering

### V-005: Scrape page conditionally renders FirstTimeHero
- **method**: static
- **severity**: critical
- **expected**: `scrape/page.tsx` renders `<FirstTimeHero>` only when `firstImportFree === true` AND `state === 'input'`
- **steps**:
  1. Read `scrape/page.tsx`
  2. Verify conditional render logic

### V-006: ProfileScrapeForm accepts and uses `initialUrl` prop
- **method**: static
- **severity**: high
- **expected**: `ProfileScrapeForm` has `initialUrl?: string` prop and pre-populates input
- **steps**:
  1. Read `profile-scrape-form.tsx`
  2. Verify prop definition and `useEffect` that syncs `initialUrl` to input state

### V-007: UrlDiscoveryList shows free badge when `firstImportFree` is true
- **method**: static
- **severity**: high
- **expected**: `url-discovery-list.tsx` accepts `firstImportFree?: boolean` prop, shows green "first import free" badge, overrides `insufficientCredits` to false
- **steps**:
  1. Read `url-discovery-list.tsx`
  2. Verify conditional badge rendering and `insufficientCredits` override logic

### V-008: Middleware redirects to `/scrape` instead of `/input`
- **method**: static
- **severity**: critical
- **expected**: `middleware.ts` redirects authenticated users from `/` to `/scrape` and from `/login`/`/register` to `/scrape`
- **steps**:
  1. Read `middleware.ts`
  2. Verify both redirect locations use `/scrape`
  3. Verify no remaining references to `/input`

### V-009: i18n strings exist in both locales
- **method**: static
- **severity**: high
- **expected**: Both `en/scrape.json` and `zh-TW/scrape.json` contain `hero.*` keys and `discover.firstImportFree` key
- **steps**:
  1. Read both translation files
  2. Verify key parity

### V-010: Scrape page loads successfully via dev server
- **method**: api
- **severity**: critical
- **endpoint**: GET /scrape
- **expected**: HTTP 200 response
- **steps**:
  1. `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/scrape`

### V-011: Profile API endpoint responds
- **method**: api
- **severity**: critical
- **endpoint**: GET /api/profile
- **expected**: HTTP 200 with JSON body containing `firstImportFree`
- **steps**:
  1. `curl -s http://localhost:3000/api/profile`
  2. Validate JSON shape

## Regression

### Area: KOL Management
- GET /api/kols → 200, returns array

### Area: Posts
- GET /api/posts → 200, returns paginated object

### Area: Stocks
- GET /api/stocks → 200, returns array

### Area: Health
- GET /api/health → 200
