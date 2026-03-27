## Why

The mobile pop-out sidebar (Sheet drawer) is out of sync with the desktop sidebar. It's missing navigation items (Scrape, Bookmarks, Subscriptions), shows hardcoded AI quota placeholder text ("12/15 this week") instead of real data, and uses a flat unstructured layout instead of the desktop's grouped sections. This makes the mobile experience feel incomplete and misleading.

## What Changes

- **Sync mobile nav items** with desktop sidebar: add missing Scrape, Bookmarks, and Subscriptions links
- **Group mobile nav items** into the same three sections as desktop (Navigation, Resources, Settings) with separators
- **Replace hardcoded AI quota** in mobile sidebar with the real `AiQuotaFooter` component (dynamic balance, color-coded progress bar, reset timer)
- **Reuse `LogoutButton`** component from desktop sidebar instead of the inline logout button

## Capabilities

### New Capabilities

_(none — this is a bug fix / alignment change, not a new capability)_

### Modified Capabilities

_(none — no spec-level requirement changes, only implementation alignment)_

## Impact

- `src/components/layout/mobile-nav.tsx` — primary file being reworked
- `src/components/layout/sidebar.tsx` — extract shared nav items/components for reuse if beneficial
- No API, data model, or dependency changes
