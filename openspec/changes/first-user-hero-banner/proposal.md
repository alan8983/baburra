## Why

New users land on `/scrape` (after middleware redirect) and see a generic "Scrape KOL Profile" page with no guidance on what to do, why it's free, or what value they'll get. The `first_import_free` mechanism exists but is invisible until step 2 of the scrape flow (credit footer). Users who don't know what URL to paste will bounce.

This is the single biggest friction point before our first private-beta users. The plan (see `docs/first-user-onboarding-plan.md`) calls for three minimal changes — no new onboarding system, just polish on the existing path.

## What Changes

1. **First-time Hero Banner on `/scrape` page**: A conditional banner shown only when `first_import_free === true`. Explains what to do ("paste a YouTube channel URL"), why it's free ("first import free, no credit card"), and offers 3 preset KOL buttons that pre-fill the URL input. Disappears permanently once `first_import_free` turns false.

2. **"First import free" badge in URL discovery list credit footer**: When `first_import_free === true`, show a prominent "First import free — no credits deducted" message next to the estimated credit cost in the scrape step-2 footer. Removes anxiety about the credit system for new users.

3. **Middleware redirect change: `/` → `/scrape` instead of `/input`**: New authenticated users should land on the scrape page (bulk channel import) rather than quick input (single URL). The scrape flow produces a much more impactful first impression — importing 20-50 posts at once → immediate win rate visibility. Also redirect logged-in users visiting `/login` or `/register` to `/scrape`.

## Capabilities

### New Capabilities

- `first-time-hero`: Conditional hero banner component for first-time users on the scrape page, with preset KOL quick-start buttons

### Modified Capabilities

- `scrape-credit-display`: Show "first import free" badge in URL discovery list credit footer when applicable
- `middleware-redirect`: Change authenticated user default landing page from `/input` to `/scrape`

## Impact

- `src/components/scrape/first-time-hero.tsx` — New component (~60 lines)
- `src/app/(app)/scrape/page.tsx` — Import and render hero banner conditionally
- `src/components/scrape/url-discovery-list.tsx` — Add free-import badge in credit footer
- `src/middleware.ts` — Change `/input` → `/scrape` in two redirect locations
- `src/messages/zh-TW/scrape.json` — Add hero banner and free-badge i18n strings
- `src/messages/en/scrape.json` — Add hero banner and free-badge i18n strings
- `src/hooks/use-profile.ts` or new hook — Expose `first_import_free` flag to client components
- `src/app/api/profile/route.ts` — Ensure `first_import_free` is returned in profile API response (if not already)
