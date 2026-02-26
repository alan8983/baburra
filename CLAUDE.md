# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Baburra.io — a backtesting tool for retail investors to evaluate which KOLs' (Key Opinion Leaders) investment opinions are trustworthy and profitable. Users track investment ideas, record predictions with sentiment, and measure accuracy over time via K-line charts and win rate calculations.

## Commands

```bash
npm run dev              # Start dev server (runs clean-dev.js first via predev)
npm run build            # Production build
npm run type-check       # TypeScript checking
npm run lint             # ESLint
npm run lint:fix         # ESLint auto-fix
npm run format           # Prettier format
npm run format:check     # Prettier check

# Unit tests (Vitest + happy-dom)
npm test                 # Run all tests once
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage
# Run a single test file:
npx vitest run src/domain/calculators/price-change.test.ts

# E2E tests (Playwright)
npm run test:e2e         # Headless
npm run test:e2e:ui      # Interactive UI
```

## Architecture

**Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Supabase (PostgreSQL) + Tailwind CSS 4 + shadcn/ui

### Layered Architecture

```
Pages/Components → Hooks (React Query) → API Routes → Repositories → Supabase
```

- **`src/domain/models/`** — TypeScript interfaces for business entities (KOL, Stock, Post, Draft, Bookmark). All domain models use camelCase.
- **`src/domain/calculators/`** — Pure functions for win rate and price change calculations.
- **`src/domain/services/`** — Domain services (AI sentiment analysis via Gemini).
- **`src/infrastructure/repositories/`** — Data access layer. Each repository maps DB rows (snake_case) to domain models (camelCase) and uses `createAdminClient()` to bypass RLS.
- **`src/infrastructure/api/`** — External API clients (Gemini for AI, Tiingo for stock prices).
- **`src/infrastructure/supabase/`** — Three Supabase client types: `client.ts` (browser), `server.ts` (Server Components/API routes), `admin.ts` (bypasses RLS for API operations).
- **`src/app/api/`** — REST API routes. All return `NextResponse.json()`, use repositories for data access.
- **`src/hooks/`** — React Query hooks wrapping API calls. Each resource has hierarchical query keys (e.g., `kolKeys.detail(id)`) and mutations that invalidate relevant queries on success.
- **`src/stores/`** — Zustand for client-only UI state (sidebar, loading).
- **`src/components/ui/`** — shadcn/ui components (New York style, Radix-based).

### Route Structure

- **`src/app/(app)/`** — Protected routes requiring auth (dashboard, kols, stocks, posts, drafts, bookmarks, settings).
- **`src/app/login/`, `src/app/register/`** — Public auth pages.
- All page and API route constants centralized in `src/lib/constants/routes.ts` (`ROUTES` and `API_ROUTES`).

### Adding a New Resource

Follow this pattern: domain model → repository → API route → hook → component/page. See existing resources (kols, stocks, posts, drafts, bookmarks) as templates.

## Internationalization

Uses **next-intl**. Default locale is `zh-TW` (Traditional Chinese), also supports `en`. Translation files in `src/messages/{locale}/`. Locale stored in `NEXT_LOCALE` cookie. Config in `src/i18n/config.ts`.

## Branch Workflow

**IMPORTANT:** At the start of every session, if the user does not specify which branch to work on, **ask which branch before making any changes.** Run `git branch` to show available branches and confirm with the user.

- `main` — stable production code. Do not commit directly unless the user explicitly says so.
- Feature/rebrand branches (e.g., `rebrand`) — used for isolated work. Always confirm the active branch before editing files.
- When committing, push to the current branch with `-u` flag if it has no upstream yet.
- When creating a new branch, always branch from `main` unless the user says otherwise.

## Key Conventions

- Path alias: `@/` maps to `src/`
- Prettier: single quotes, semicolons, 100 char width, trailing commas (es5), tailwindcss plugin
- DB migrations in `supabase/migrations/`, seed data in `supabase/seed.sql` (full) and `supabase/seed-minimal.sql` (categories only)
- Development auth: set `DEV_USER_ID` env var to bypass login
- Test files: `src/**/*.{test,spec}.{ts,tsx}` (Vitest config in `vitest.config.mts`)
- Documentation in `docs/` (ARCHITECTURE.md, API_SPEC.md, DOMAIN_MODELS.md, WEB_DEV_PLAN.md)
