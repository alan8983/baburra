## Context

The monitoring pipeline's skeleton is already deployed: `monitor-subscriptions` cron runs every 6 hours, `checkForNewContent()` does full profile extraction then filters by existing URLs, `process-jobs` cron processes queued jobs every 5 minutes, and `NotificationBell` reads scrape completions from localStorage. Monitoring auto-enables on first subscription and auto-disables on last unsubscription. `CRON_SECRET` bearer token authentication is in place.

However, the current implementation has production gaps:
- `checkForNewContent()` re-extracts ALL recent videos (up to 50) and checks each against the DB — wasteful for frequent checks
- No platform cap enforcement means monitoring continues even after hitting `SCRAPE_CAPS`
- Batch limit is hardcoded at 5 sources per cron invocation with no staggering
- Notifications are localStorage-only (single-device, lost on clear)
- No structured logging for monitoring health visibility

## Goals / Non-Goals

**Goals:**
- Optimise YouTube incremental discovery using `publishedAfter` parameter to avoid redundant API calls
- Enforce platform caps in monitoring loop — auto-disable when at limit
- Configurable batch limit with staggered `next_check_at` to distribute load
- Persistent notifications via database table, consumed by existing `NotificationBell`
- Per-source failure isolation so one broken extractor doesn't block monitoring
- Quota-exempt incremental processing (system cost, not user credits)

**Non-Goals:**
- Email or push notifications (separate future change)
- Admin monitoring dashboard (operational visibility — nice-to-have, not MVP)
- Twitter/Instagram/Facebook incremental extractors (not yet built)
- Cron infrastructure migration (Vercel Pro vs external — deployment decision)
- Changing the cron schedule (kept at 6 hours)

## Decisions

### D1: YouTube `publishedAfter` optimisation vs full-extract-then-filter

**Decision**: Add `discoverNewerVideos(channelId, publishedAfter, maxResults)` to `YouTubeChannelExtractor` and use it in `checkForNewContent()`.

**Rationale**: Currently `extractProfile()` fetches up to 50 recent videos and then checks each URL against the DB. With `publishedAfter`, the YouTube API returns only videos published since `last_scraped_at`, reducing API quota usage from ~100 units per check to ~100 units only when there's new content (most checks return 0 results quickly). This mirrors the `publishedBefore` pattern from the deepening-scrape change.

**Alternative**: Keep full-extract-then-filter. Rejected because at 4 checks/day × N KOLs, the unnecessary API calls and DB lookups add up significantly.

### D2: Batch limit as constant vs environment variable

**Decision**: Define `MONITORING_BATCH_LIMIT = 20` as a constant in `config.ts`. Do not use an environment variable.

**Rationale**: The batch limit is a tuning parameter that only changes with architecture changes (e.g., moving to a faster cron interval). Environment variables add deployment complexity for a value that changes once a year at most. The 20-source limit processes comfortably within Vercel's 60s function timeout (each `checkForNewContent` takes ~2-5s).

### D3: Stagger `next_check_at` on first monitoring enable

**Decision**: When monitoring is first enabled, set `next_check_at = NOW() + random(0, monitor_frequency_hours)` instead of `NOW() + monitor_frequency_hours`.

**Rationale**: If 50 users subscribe to different KOLs within an hour, all 50 sources would have their first check at the same time, creating a thundering herd. Staggering distributes the load evenly across the monitoring window. Subsequent checks self-stagger because they're based on actual check time + frequency.

### D4: `notifications` table vs keep localStorage

**Decision**: Create a `notifications` table with API endpoints. The `NotificationBell` component reads from the API, falling back to localStorage for backward compatibility during migration.

**Rationale**: localStorage notifications are single-device and lost on browser clear. For a retention-critical feature (new post alerts), persistence and cross-device access are essential. The table is simple: `id, user_id, type, title, body, metadata (JSONB), read, created_at`.

**Schema**:
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'new_posts',
  title TEXT NOT NULL,
  body TEXT,
  metadata JSONB DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read) WHERE read = FALSE;
```

### D5: Platform cap enforcement — disable monitoring vs skip silently

**Decision**: When a kol_source reaches its `SCRAPE_CAPS` limit, auto-disable monitoring (`monitoring_enabled = false`) and log a warning.

**Rationale**: Silently skipping wastes a cron slot every cycle. Disabling is explicit and recoverable — if the cap is raised in the future, monitoring can be re-enabled. The monitoring disable is logged for operational visibility.

### D6: Notification creation — inline in cron vs after job completion

**Decision**: Create notifications after job completion in `processJobBatch()`, not in the monitoring cron.

**Rationale**: The monitoring cron creates jobs but doesn't process them — `process-jobs` handles that. Notifications should fire when posts are actually imported, not when the job is queued. This also means manually-triggered incremental jobs generate notifications too.

## Risks / Trade-offs

**[YouTube API quota]** → Each monitored YouTube source costs ~100 API units per check even with `publishedAfter` (the search endpoint has a minimum cost). At 20 sources × 4 checks/day = 8,000 units/day out of 10,000 daily quota. Mitigation: batch limit caps exposure; `publishedAfter` returns empty results fast; can reduce check frequency if quota becomes tight.

**[Notification table growth]** → Without cleanup, notifications accumulate indefinitely. Mitigation: add a `created_at < NOW() - 30 days` cleanup in the monitoring cron (piggyback on existing invocation). Alternatively, RLS policy with auto-delete after 30 days.

**[Vercel function timeout]** → 20 sources × 3-5s each = 60-100s, exceeding Vercel's 60s limit. Mitigation: use a 50s timeout like `process-jobs`; process as many sources as possible within the window and leave the rest for next cycle (they remain overdue and will be picked up first).

**[Backward compatibility during notification migration]** → Users on old frontend still use localStorage. Mitigation: keep writing to localStorage during transition period; new frontend reads API first, falls back to localStorage.
