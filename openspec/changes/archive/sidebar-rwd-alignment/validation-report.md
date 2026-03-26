# Validation Report: sidebar-rwd-alignment

## Summary
| Item | Count |
|------|-------|
| Total Tests | 13 |
| Pass | 13 |
| Fail | 0 |
| Skipped | 0 |
| Critical Failures | 0 |

## Commit Verdict: CLEAR TO COMMIT

## Pre-flight
- Type Check: (skip - already verified in parent)
- Unit Tests: (skip - already verified in parent)
- Tasks Complete: 6/6 marked [x]

## Change-Specific Tests

### V-001: AiQuotaFooter and LogoutButton are exported from sidebar.tsx
- **Status**: Pass
- **Evidence**: `export function AiQuotaFooter` at line 118 and `export function LogoutButton` at line 276 in `sidebar.tsx`. Both are named exports accessible to `mobile-nav.tsx`.

### V-002: mobile-nav.tsx imports shared components
- **Status**: Pass
- **Evidence**: Line 29 of `mobile-nav.tsx`: `import { AiQuotaFooter, LogoutButton } from './sidebar';`

### V-003: Mobile nav items match desktop — Scrape, Bookmarks, Subscriptions added
- **Status**: Pass
- **Evidence**: `navItems` in `mobile-nav.tsx` (lines 45-57) includes `scrape` (ROUTES.SCRAPE), `bookmarks` (ROUTES.BOOKMARKS), and `subscriptions` (ROUTES.SUBSCRIPTIONS), matching the desktop `navItems` array in `sidebar.tsx` (lines 49-61) exactly.

### V-004: Mobile nav grouped into three sections with separators
- **Status**: Pass
- **Evidence**: `mobile-nav.tsx` renders `navItems`, `resourceItems`, and `settingsItems` in three separate `<div>` blocks separated by `<Separator />` components (lines 119-127), matching the desktop layout.

### V-005: Hardcoded AI quota replaced with AiQuotaFooter component
- **Status**: Pass
- **Evidence**: Line 131 renders `<AiQuotaFooter isCollapsed={false} />`. No hardcoded "12/15" text exists anywhere in `mobile-nav.tsx`.

### V-006: Inline logout replaced with LogoutButton component
- **Status**: Pass
- **Evidence**: Line 134 renders `<LogoutButton isCollapsed={false} />`. No inline logout button implementation in `mobile-nav.tsx`.

### V-007: AI usage API returns valid data
- **Status**: Pass
- **Evidence**: `GET /api/ai/usage` returns HTTP 200 with JSON `{"balance":850,"weeklyLimit":850,"resetAt":"2026-03-19T00:00:00.000Z",...}` — confirms the AiQuotaFooter will have real data to render.

## Regression Tests

### R-001: Dashboard page loads
- **Status**: Pass
- **Evidence**: `GET /dashboard` returned HTTP 200.

### R-002: All newly-linked pages load (Scrape, Bookmarks, Subscriptions)
- **Status**: Pass
- **Evidence**: `GET /scrape` HTTP 200, `GET /bookmarks` HTTP 200, `GET /subscriptions` HTTP 200.

### R-003: Health API responds
- **Status**: Pass
- **Evidence**: `GET /api/health` returned HTTP 200.

## Visual Validation (Preview Tool)

### VV-001: Mobile nav drawer opens with all three grouped sections
- **Status**: Pass
- **Evidence**: Screenshot (375x812 mobile viewport) shows Sheet drawer with three distinct sections separated by visual separators: Navigation (Dashboard, 新增追蹤, 擷取 KOL, 草稿, 書籤, 訂閱管理), Resources (KOL 列表, 投資標的, 所有文章), Settings (設定).

### VV-002: Real AI quota footer in mobile nav
- **Status**: Pass
- **Evidence**: Accessibility snapshot of dialog shows "AI 點數 · 今天重置 · 850 / 850 本週" — live data from /api/ai/usage, not hardcoded "12/15".

### VV-003: LogoutButton renders in mobile nav
- **Status**: Pass
- **Evidence**: Accessibility snapshot shows `button: "登出"` at bottom of mobile nav dialog, confirming shared LogoutButton component is rendered.
