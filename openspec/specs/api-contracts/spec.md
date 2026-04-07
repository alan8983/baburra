# API Contracts Spec

> Living spec for Baburra.io REST API endpoints.
> **Canonical source**: `docs/API_SPEC.md` for detailed request/response shapes.

## API Route Overview

All API routes live in `src/app/api/` and return `NextResponse.json()`.

### Auth

| Method | Path | Description |
| --- | --- | --- |
| POST | /api/auth/signup | Register |
| POST | /api/auth/login | Login |
| POST | /api/auth/logout | Logout |
| GET | /api/auth/session | Get session |

### KOLs

| Method | Path | Description |
| --- | --- | --- |
| GET | /api/kols | List (search) |
| GET | /api/kols/[id] | Detail |
| POST | /api/kols | Create |
| PATCH | /api/kols/[id] | Update |
| GET | /api/kols/[id]/posts | KOL's posts |
| GET | /api/kols/[id]/win-rate | Win rate stats |

### Stocks

| Method | Path | Description |
| --- | --- | --- |
| GET | /api/stocks | List (search) |
| GET | /api/stocks/[ticker] | Detail |
| POST | /api/stocks | Create |
| GET | /api/stocks/[ticker]/posts | Related posts |
| GET | /api/stocks/[ticker]/prices | Price data |
| GET | /api/stocks/[ticker]/win-rate | Win rate |
| GET | /api/stocks/[ticker]/arguments | Argument summary |

### Posts

| Method | Path | Description |
| --- | --- | --- |
| GET | /api/posts | List |
| GET | /api/posts/[id] | Detail |
| POST | /api/posts | Create |
| PATCH | /api/posts/[id] | Update |
| DELETE | /api/posts/[id] | Delete |
| GET | /api/posts/check-duplicate | Check duplicate URL |
| POST | /api/posts/[id]/reanalyze | Re-run AI analysis |

### Drafts

| Method | Path | Description |
| --- | --- | --- |
| GET | /api/drafts | My drafts |
| GET | /api/drafts/[id] | Detail |
| POST | /api/drafts | Create |
| PATCH | /api/drafts/[id] | Update |
| DELETE | /api/drafts/[id] | Delete |

### AI

| Method | Path | Description |
| --- | --- | --- |
| POST | /api/ai/analyze | Sentiment analysis |
| POST | /api/ai/extract-arguments | Extract arguments |
| POST | /api/ai/extract-draft-arguments | Extract from draft |
| GET | /api/ai/usage | Quota usage |
| GET | /api/argument-categories | Category list |

### Import & Scrape

| Method | Path | Description |
| --- | --- | --- |
| POST | /api/import/batch | Batch import (URLs) |
| POST | /api/scrape/discover | Discover profile URLs |
| POST | /api/scrape/profile | Initiate profile scrape |
| GET | /api/scrape/status/[jobId] | Scrape job status |

### Content Unlocks (Layer 2/3 gating)

| Method | Path | Description |
| --- | --- | --- |
| GET | /api/unlocks | List current user's L2/L3 unlocks |
| POST | /api/unlocks/layer2 | Unlock `(kolId, stockId)` deep dive — Free uses monthly quota, Pro/Max no-op |
| POST | /api/unlocks/layer3 | Unlock `stockId` stock page — Pro pays credits, Free 402, Max no-op |

### Cron (Vercel Cron Functions)

| Method | Path | Description |
| --- | --- | --- |
| GET | /api/cron/process-jobs | Process scrape queue (every 5 min) |
| GET | /api/cron/monitor-subscriptions | Check new content (every 6 hours) |

### Other

| Method | Path | Description |
| --- | --- | --- |
| GET | /api/health | Health check |
| GET | /api/dashboard/stats | Dashboard statistics |
| PATCH | /api/profile | Update profile |
| POST/GET | /api/bookmarks | Bookmark CRUD |
| POST | /api/ab/events | A/B test events |
| POST | /api/quick-input | Quick input → draft + AI |

## Conventions

- All endpoints use `createAdminClient()` for data access (bypasses RLS)
- Auth: `getUserId()` helper extracts user from Supabase session
- Error responses: `{ error: string, code?: string }` via `ApiError` class
- Validation: Zod schemas from `src/lib/validation.ts`
