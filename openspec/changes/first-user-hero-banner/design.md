## Overview

Three surgical changes to the existing scrape flow that remove friction for first-time users. No new systems, no new DB columns, no new API endpoints beyond extending the existing profile API response.

## Architecture

### Data Flow

```
profiles.first_import_free (DB)
  → GET /api/profile (add field to response)
    → useProfile() hook (add to ProfileData type)
      → ScrapePage reads flag
        → FirstTimeHero (conditional render)
        → UrlDiscoveryList (conditional free badge)
```

### Component Hierarchy

```
ScrapePage
├── FirstTimeHero (NEW — only when firstImportFree === true)
│   ├── Hero text (i18n)
│   ├── URL input hint
│   └── Preset KOL buttons (pre-fill ProfileScrapeForm)
├── ScrapeFlowChart
├── ProfileScrapeForm (receives optional initialUrl prop)
├── UrlDiscoveryList (existing — add free badge in credit footer)
└── ScrapeProgress
```

## Design Decisions

### 1. Expose `first_import_free` via existing profile API

**Decision**: Add `first_import_free` to `getProfile()` query and response, rather than creating a new API endpoint.

**Rationale**: The profile hook is already loaded by AppShell/sidebar. Adding one boolean field costs nothing and avoids an extra network request. The scrape page simply reads `useProfile().data?.firstImportFree`.

**Changes**:
- `profile.repository.ts`: Add `first_import_free` to `getProfile()` SELECT clause and return object
- `use-profile.ts`: Add `firstImportFree: boolean` to `ProfileData` interface
- No new API route needed

### 2. Hero Banner as standalone component

**Decision**: Create `src/components/scrape/first-time-hero.tsx` as a self-contained component.

**Rationale**: Keeps the scrape page clean. The hero only needs two things: i18n translations and a callback to pre-fill the URL input. When `first_import_free` is false, the parent simply doesn't render it.

**Props**:
```typescript
interface FirstTimeHeroProps {
  onSelectPreset: (url: string) => void;
}
```

### 3. Preset KOL buttons pre-fill, don't auto-submit

**Decision**: Clicking a preset KOL button calls `onSelectPreset(url)` which sets the URL in `ProfileScrapeForm`'s input field. The user still clicks "Discover Content" to proceed.

**Rationale**: Gives users control and understanding of the flow. Auto-submitting would skip the mental model of "I paste → I submit → I see results".

**Implementation**: Add `initialUrl` prop to `ProfileScrapeForm`. When set, pre-populate the input field. ScrapePage holds the state and passes it down.

### 4. Preset KOL URLs hardcoded in i18n

**Decision**: Store preset KOL names and URLs in the translation files, not in a config file or DB.

**Rationale**: The presets are locale-specific (Taiwanese KOLs for zh-TW, potentially different for en). Only 3 entries. No dynamic behavior needed. Easy to change without code deployment if using i18n platform.

### 5. Free badge placement in credit footer

**Decision**: Add a conditional line inside the existing credit estimation `<div>` in `UrlDiscoveryList`, between the balance display and the credit note.

**Rationale**: This is exactly where the user is looking when they worry about cost. A green badge with "First import free — no credits deducted" directly addresses the anxiety. Also, override `insufficientCredits` to always be `false` when `first_import_free` is true (since no credits will actually be consumed).

### 6. Middleware redirect to `/scrape`

**Decision**: Change the two places in `middleware.ts` that redirect to `/input` to redirect to `/scrape` instead.

**Rationale**: The scrape flow (bulk channel import → 20-50 posts → win rate) is the highest-impact first experience. Single URL import via `/input` produces one post — not compelling enough to retain a new user. The `/input` page remains accessible via sidebar nav.

## Files Changed

| File | Change |
|------|--------|
| `src/infrastructure/repositories/profile.repository.ts` | Add `first_import_free` to `getProfile()` SELECT and return |
| `src/hooks/use-profile.ts` | Add `firstImportFree` to `ProfileData` type |
| `src/components/scrape/first-time-hero.tsx` | **NEW** — Hero banner component |
| `src/components/scrape/profile-scrape-form.tsx` | Add optional `initialUrl` prop |
| `src/app/(app)/scrape/page.tsx` | Render hero, manage preset URL state, pass `initialUrl` |
| `src/components/scrape/url-discovery-list.tsx` | Add free badge in credit footer, pass `firstImportFree` prop |
| `src/middleware.ts` | `/input` → `/scrape` in two redirect locations |
| `src/messages/zh-TW/scrape.json` | Add `hero.*` and `discover.firstImportFree` keys |
| `src/messages/en/scrape.json` | Add `hero.*` and `discover.firstImportFree` keys |
