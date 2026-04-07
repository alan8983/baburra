## 1. Quick-Nav Component

- [x] 1.1 Create `src/components/input/input-page-quick-nav.tsx` exporting `InputPageQuickNav`. Internally call `useKols()` and `useStocks()`, sort by `createdAt` desc, slice top 3.
- [x] 1.2 Render three stacked `<Card>` elements: Dashboard (entire card is `<Link>` to `ROUTES.DASHBOARD`), KOLs (header `<Link>` to `ROUTES.KOLS` + 3 chip `<Link>`s to `ROUTES.kolDetail(id)`), Stocks (header `<Link>` to `ROUTES.STOCKS` + 3 chip `<Link>`s to `ROUTES.stockDetail(id)`).
- [x] 1.3 Implement loading state (3 skeleton chips per card) and empty state (descriptive copy, no chips, header link still active).
- [x] 1.4 Style chips as clickable `<Badge>` variants wrapped in `<Link>` with hover/focus rings.

## 2. Page Layout

- [x] 2.1 Update `src/app/(app)/input/page.tsx` to wrap content in `grid grid-cols-1 lg:grid-cols-3 gap-6`. Main column `lg:col-span-2` contains the smart-input card and `<RecentScrapeJobs />`. Right column `lg:col-span-1` contains `<InputPageQuickNav />`.
- [x] 2.2 Verify stepper remains above the grid and unchanged.
- [x] 2.3 Verify below `lg` the layout collapses to single column with right rail stacked at the bottom.

## 3. i18n

- [x] 3.1 Add `input.quickNav.dashboard.{title,description}`, `input.quickNav.kols.{title,description,empty}`, `input.quickNav.stocks.{title,description,empty}` to `src/messages/en/input.json`.
- [x] 3.2 Mirror the same keys with Traditional Chinese copy in `src/messages/zh-TW/input.json`.

## 4. Tests

- [x] 4.1 Add `src/components/input/__tests__/input-page-quick-nav.test.tsx` (React Testing Library): renders all 3 cards; sorts and slices top 3; renders empty-state copy when lists are empty; renders skeletons while loading; chips link to detail routes.

## 5. Validation

- [x] 5.1 `npm run type-check` passes.
- [x] 5.2 `npm run lint` passes (no new warnings).
- [x] 5.3 `npm test` passes including the new component tests.
- [x] 5.4 Manual preview: verify desktop (≥1280px), tablet (768px), and mobile (375px) layouts match the wireframe intent; verify chip links navigate to the correct detail pages.
