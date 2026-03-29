## Why

Without automated monitoring, users must manually re-scrape KOLs to get new content — friction that undermines Baburra's core promise of "track KOL accuracy over time". The basic infrastructure already exists (`monitor-subscriptions` cron, `checkForNewContent()`, monitoring enable/disable), but it lacks production-readiness: no platform cap enforcement during monitoring, no backpressure controls, no persistent cross-device notifications, no `publishedAfter` optimisation for YouTube, and incremental jobs aren't quota-exempt. This change hardens the monitoring pipeline into a reliable background system ready for real user load.

## What Changes

- **Batch limit and backpressure** for `monitor-subscriptions` cron — configurable max sources per invocation (default 20), staggered `next_check_at` to spread load
- **Platform cap enforcement** in monitoring — auto-disable monitoring when a kol_source reaches its `SCRAPE_CAPS` limit
- **YouTube `publishedAfter` optimisation** — extend `YouTubeChannelExtractor` with `discoverNewerVideos()` to query only new content since `last_scraped_at`, replacing the current full-extract-then-filter approach
- **Quota-exempt incremental processing** — incremental_check jobs triggered by monitoring are system cost (already using `triggered_by = null` but pipeline needs to respect it)
- **Persistent notifications** — new `notifications` table and API for cross-device new-post notifications, replacing localStorage-only approach while keeping the existing `NotificationBell` component
- **Failure isolation improvements** — per-source error handling with structured logging, skip-and-continue on individual source failures

## Capabilities

### New Capabilities
- `incremental-monitoring`: Automated periodic monitoring of subscribed KOL sources — batch processing, backpressure, cap enforcement, and `publishedAfter` discovery
- `persistent-notifications`: Server-persisted notification system for new-post alerts, consumed by existing `NotificationBell` UI

### Modified Capabilities
- (none — existing subscription and scrape APIs retain their current contracts)

## Impact

- **Database**: New `notifications` table; no changes to existing tables (monitoring fields already exist on `kol_sources`)
- **API routes**: Enhanced `GET /api/cron/monitor-subscriptions` with backpressure; new `GET/PATCH /api/notifications` endpoints
- **YouTube extractor**: New `discoverNewerVideos()` method — additional YouTube Data API v3 calls using `publishedAfter`
- **Service layer**: `checkForNewContent()` refactored to use `publishedAfter` discovery and enforce platform caps
- **Frontend**: `NotificationBell` updated to read from API instead of localStorage (backward-compatible fallback)
- **Infrastructure**: Requires Vercel Pro plan (or external cron) for `vercel.json` crons to execute; works with existing `CRON_SECRET` auth
