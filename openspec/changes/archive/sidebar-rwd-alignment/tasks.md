## 1. Export shared components from sidebar

- [x] 1.1 Export `AiQuotaFooter` and `LogoutButton` from `sidebar.tsx` (or move to shared files) so `mobile-nav.tsx` can import them

## 2. Align mobile nav items

- [x] 2.1 Add missing nav items to mobile sidebar: Scrape, Bookmarks, Subscriptions
- [x] 2.2 Group mobile nav items into three sections (Navigation, Resources, Settings) with separators, matching desktop layout

## 3. Replace hardcoded AI quota

- [x] 3.1 Replace the hardcoded "12/15 this week" quota display with the real `AiQuotaFooter` component (pass `isCollapsed={false}`)
- [x] 3.2 Replace the inline logout button with the shared `LogoutButton` component

## 4. Verify

- [x] 4.1 Preview mobile sidebar and confirm all items, groupings, AI quota, and logout match the desktop version
