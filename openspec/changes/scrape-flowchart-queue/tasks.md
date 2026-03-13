# Tasks: Scrape Flow Chart + Queue System

## Backend

- [ ] 1. Create `discoverProfileUrls()` in `profile-scrape.service.ts` — extract discovery phase from `initiateProfileScrape()`
- [ ] 2. Create `POST /api/scrape/discover` API route
- [ ] 3. Modify `initiateProfileScrape()` to accept optional `selectedUrls` parameter
- [ ] 4. Update `POST /api/scrape/profile` to pass `selectedUrls` through

## Frontend Components

- [ ] 5. Create `ScrapeFlowChart` component (5-step stepper)
- [ ] 6. Create `UrlDiscoveryList` component (checkbox list with select all/deselect all)
- [ ] 7. Create `useDiscoverProfile` hook (mutation calling discover API)
- [ ] 8. Add queue position indicator to `ScrapeProgress`
- [ ] 9. Add auto-redirect on completion to `ScrapeProgress`

## Notification System

- [ ] 10. Create `useNotifications` hook (localStorage polling)
- [ ] 11. Create `NotificationBell` component (dropdown with dismiss)
- [ ] 12. Integrate `NotificationBell` into `header.tsx` (replace hardcoded bell)

## Page Integration

- [ ] 13. Remake `ScrapePage` as state machine (input → discovering → selecting → processing → redirecting)
- [ ] 14. Update `useInitiateScrape` hook to pass `selectedUrls`

## i18n & Docs

- [ ] 15. Add i18n translations (en + zh-TW) for flow chart, discover, queue, notifications
- [ ] 16. Update `WEB_DEV_PLAN.md` and `BACKLOG.md`
