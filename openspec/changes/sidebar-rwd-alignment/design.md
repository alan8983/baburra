## Context

The desktop sidebar (`sidebar.tsx`) and mobile sidebar (`mobile-nav.tsx`) were developed independently and have drifted apart. The desktop sidebar has 3 grouped sections (nav, resources, settings), 10 navigation items, a dynamic AI quota footer with color-coded progress, and a responsive logout button. The mobile sidebar has a flat list of 7 items, hardcoded "12/15" quota text, and an inline logout button.

## Goals / Non-Goals

**Goals:**
- Mobile sidebar matches desktop in content: same nav items, same groupings, same dynamic AI quota
- Reuse existing components (`AiQuotaFooter`, `LogoutButton`, nav item arrays) rather than duplicating

**Non-Goals:**
- Redesigning the sidebar layout or adding new features
- Changing the desktop sidebar behavior
- Adding collapse/expand to mobile (not needed — it's a Sheet that closes on navigation)

## Decisions

### 1. Extract shared nav config vs. inline duplication

**Decision:** Extract the nav item arrays (`navItems`, `resourceItems`, `settingsItems`) into a shared module or define them in `mobile-nav.tsx` identically.

**Rationale:** The nav items in `sidebar.tsx` are defined as local constants inside the component (they depend on hooks like `useTranslations` and `useDraftsCount`). Extracting them to a shared module would require refactoring the desktop sidebar too. Instead, replicate the same arrays in `mobile-nav.tsx` — they're small, declarative, and easy to keep in sync.

### 2. Reuse `AiQuotaFooter` and `LogoutButton`

**Decision:** Export `AiQuotaFooter` and `LogoutButton` from `sidebar.tsx` (or a shared file) and import them in `mobile-nav.tsx`. Pass `isCollapsed={false}` since mobile is always expanded.

**Rationale:** These components already handle the full rendering logic (loading states, color coding, reset timer). Duplicating this would be error-prone. A simple export is the lowest-friction approach.

## Risks / Trade-offs

- **Drift risk**: Nav items are still duplicated across two files → Mitigation: small surface area, easy to spot in review. A future refactor could extract shared config, but not worth the complexity now.
- **Sheet height**: Adding more items + quota footer may overflow on very short screens → Mitigation: `ScrollArea` already wraps the mobile nav content.
