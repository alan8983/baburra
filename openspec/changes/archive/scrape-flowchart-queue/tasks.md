# Tasks: Scrape Flow Chart + Queue System

> **Status**: ✅ Complete (2026-03-13)
> Ready for archive.

## Backend

- [x] 1. Create `discoverProfileUrls()` in `profile-scrape.service.ts` — extract discovery phase from `initiateProfileScrape()`
- [x] 2. Create `POST /api/scrape/discover` API route
- [x] 3. Modify `initiateProfileScrape()` to accept optional `selectedUrls` parameter
- [x] 4. Update `POST /api/scrape/profile` to pass `selectedUrls` through

## Frontend Components

- [x] 5. Create `ScrapeFlowChart` component (5-step stepper)
- [x] 6. Create `UrlDiscoveryList` component (checkbox list with select all/deselect all)
- [x] 7. Create `useDiscoverProfile` hook (mutation calling discover API)
- [x] 8. Add queue position indicator to `ScrapeProgress`
- [x] 9. Add auto-redirect on completion to `ScrapeProgress`

## Notification System

- [x] 10. Create `useNotifications` hook (localStorage polling)
- [x] 11. Create `NotificationBell` component (dropdown with dismiss)
- [x] 12. Integrate `NotificationBell` into `header.tsx` (replace hardcoded bell)

## Page Integration

- [x] 13. Remake `ScrapePage` as state machine (input → discovering → selecting → processing → redirecting)
- [x] 14. Update `useInitiateScrape` hook to pass `selectedUrls`

## i18n & Docs

- [x] 15. Add i18n translations (en + zh-TW) for flow chart, discover, queue, notifications
- [x] 16. Update `WEB_DEV_PLAN.md` and `BACKLOG.md`
