## 1. Database & Types

- [ ] 1.1 Create migration: `notifications` table with `id, user_id, type, title, body, metadata (JSONB), read, created_at` and index on `(user_id, read) WHERE read = FALSE`
- [ ] 1.2 Add `Notification` domain model to `src/domain/models/` with camelCase fields
- [ ] 1.3 Run migration and regenerate Supabase TypeScript types

## 2. Constants

- [ ] 2.1 Add `MONITORING_BATCH_LIMIT = 20` and `MONITORING_TIMEOUT_MS = 50_000` to `src/lib/constants/config.ts`
- [ ] 2.2 Add `NOTIFICATION_RETENTION_DAYS = 30` constant to `config.ts`

## 3. YouTube Extractor

- [ ] 3.1 Add `discoverNewerVideos(channelId, publishedAfter, maxResults)` method to `YouTubeChannelExtractor` using YouTube Data API v3 Search with `publishedAfter` parameter, returning `DiscoveredUrl[]`

## 4. Notification Repository & API

- [ ] 4.1 Create `src/infrastructure/repositories/notification.repository.ts` with: `createNotification()`, `getUserNotifications(userId, unreadOnly?)`, `markAsRead(id)`, `markAllAsRead(userId)`, `deleteOldNotifications(olderThanDays)`
- [ ] 4.2 Create `GET /api/notifications` route — returns user's notifications (supports `?unread=true` filter, limit 50)
- [ ] 4.3 Create `PATCH /api/notifications/[id]` route — marks a single notification as read
- [ ] 4.4 Create `PATCH /api/notifications/read-all` route — marks all user's notifications as read
- [ ] 4.5 Add repository exports to `src/infrastructure/repositories/index.ts`

## 5. Notification Creation on Job Completion

- [ ] 5.1 Create `notifySubscribersOfNewPosts(kolSourceId, kolName, importedCount, jobId)` function in a notification service — queries subscribers with `notify_new_posts = true` and creates one notification per user
- [ ] 5.2 Call `notifySubscribersOfNewPosts()` from `processJobBatch()` when an `incremental_check` job completes with `importedCount > 0`

## 6. Monitoring Hardening

- [ ] 6.1 Refactor `checkForNewContent()` to use `discoverNewerVideos()` for YouTube sources (fall back to `extractProfile()` when `last_scraped_at` is null or platform doesn't support it)
- [ ] 6.2 Add platform cap enforcement in `checkForNewContent()` — check `posts_scraped_count >= SCRAPE_CAPS[platform]`, if true call `disableMonitoring()` and return early
- [ ] 6.3 Cap discovered URLs to remaining capacity (`SCRAPE_CAPS[platform] - posts_scraped_count`) before creating the job
- [ ] 6.4 Stagger `next_check_at` in `enableMonitoring()` — use `NOW() + random(0, frequency)` instead of `NOW() + frequency`

## 7. Monitor-subscriptions Cron Enhancement

- [ ] 7.1 Update `monitor-subscriptions` cron to use `MONITORING_BATCH_LIMIT` (20) instead of hardcoded 5
- [ ] 7.2 Add 50-second timeout safeguard — stop processing additional sources when elapsed time exceeds threshold
- [ ] 7.3 Add notification cleanup step at cron start: `deleteOldNotifications(NOTIFICATION_RETENTION_DAYS)`
- [ ] 7.4 Add structured logging: checked count, new jobs created, failures count, elapsed time

## 8. Frontend: NotificationBell Migration

- [ ] 8.1 Create `useNotifications` React Query hook wrapping `GET /api/notifications` with polling interval
- [ ] 8.2 Update `NotificationBell` to read from API hook, falling back to localStorage on error
- [ ] 8.3 Update dismiss/dismiss-all actions to call `PATCH /api/notifications/[id]` and `PATCH /api/notifications/read-all`

## 9. Tests

- [ ] 9.1 Unit test `discoverNewerVideos()` — API call with correct `publishedAfter`, result mapping, empty results
- [ ] 9.2 Unit test `checkForNewContent()` — publishedAfter path, fallback path, cap enforcement, monitoring disable
- [ ] 9.3 Unit test `notifySubscribersOfNewPosts()` — subscriber filtering, notification creation
- [ ] 9.4 Unit test notification repository — CRUD operations
- [ ] 9.5 Run full test suite and type-check to verify no regressions
