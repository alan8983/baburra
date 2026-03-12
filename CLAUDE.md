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

## Mandatory Documentation Updates

**IMPORTANT:** Whenever any adjustment is made to this project (feature changes, bug fixes, scope changes, reprioritization, etc.), **always update both of these files**:

1. **`docs/WEB_DEV_PLAN.md`** — Web Dev Plan
2. **`docs/BACKLOG.md`** — Backlog

This applies regardless of environment — Cloud environment or local worktree.

## Environment Setup

**IMPORTANT:** `.env*` is gitignored, so `.env.local` is **NOT** available in new worktrees or Cloud environments by default. You must set it up manually.

### Local Worktrees

When working in a local worktree (e.g., `.claude/worktrees/<name>/`), copy `.env.local` from the main repo root:

```bash
cp /c/Cursor_Master/investment-idea-monitor/.env.local .env.local
```

### Cloud Environments

In Cloud (remote) environments, `.env.local` does not exist. The preferred setup is:
1. **Pre-configured:** The user sets environment variables in the Claude Code web UI (claude.ai/code → Environment Settings). If these are set, create `.env.local` from them at session start.
2. **Fallback:** If env vars are not pre-configured, ask the user to provide the required values, then create `.env.local` from `.env.example` and fill them in.

### Required Variables

See `.env.example` for the full list. At minimum you need:
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase connection
- `SUPABASE_SERVICE_ROLE_KEY` — Server-side Supabase (bypasses RLS)
- `GEMINI_API_KEY` — AI sentiment analysis
- `TIINGO_API_TOKEN` — Stock price data
- `DEV_USER_ID` — Bypass auth in development

### Previewing

When previewing the production build (both Cloud and local), ensure `.env.local` exists with real credentials so the preview can connect to services and produce meaningful results.

## Dev Server (Preview Tool)

The Claude Preview tool uses `.claude/launch.json` to start the dev server. On Windows, `npm` cannot be spawned directly — use `node` with the Next.js binary instead:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "next-dev",
      "runtimeExecutable": "node",
      "runtimeArgs": ["node_modules/next/dist/bin/next", "dev", "--webpack"],
      "port": 3000,
      "autoPort": true
    }
  ]
}
```

**In worktrees:** `node_modules` is NOT shared. Run `npm install` in the worktree before starting the dev server.

## Key Conventions

- Path alias: `@/` maps to `src/`
- Prettier: single quotes, semicolons, 100 char width, trailing commas (es5), tailwindcss plugin
- DB migrations in `supabase/migrations/`, seed data in `supabase/seed.sql` (full) and `supabase/seed-minimal.sql` (categories only)
- Development auth: set `DEV_USER_ID` env var to bypass login
- Test files: `src/**/*.{test,spec}.{ts,tsx}` (Vitest config in `vitest.config.mts`)
- Documentation in `docs/` (ARCHITECTURE.md, API_SPEC.md, DOMAIN_MODELS.md, WEB_DEV_PLAN.md)
