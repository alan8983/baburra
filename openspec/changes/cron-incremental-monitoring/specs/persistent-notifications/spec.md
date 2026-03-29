## ADDED Requirements

### Requirement: Notifications table stores cross-device alerts
The system SHALL persist notifications in a `notifications` table with fields: `id`, `user_id`, `type`, `title`, `body`, `metadata` (JSONB), `read` (boolean), `created_at`.

#### Scenario: Notification created on new post import
- **WHEN** an incremental_check job completes and imports N posts for a KOL
- **THEN** the system SHALL create one notification per subscribed user (where `notify_new_posts = true`) with `type = 'new_posts'`, the KOL name in the title, import count in body, and `{ kolId, jobId }` in metadata

#### Scenario: User has no notify_new_posts enabled
- **WHEN** a user is subscribed to a KOL source but `notify_new_posts = false`
- **THEN** no notification SHALL be created for that user

### Requirement: Notifications API for reading and marking
The system SHALL provide API endpoints for retrieving and managing notifications.

#### Scenario: GET /api/notifications returns unread notifications
- **WHEN** an authenticated user calls `GET /api/notifications`
- **THEN** the system SHALL return the user's notifications ordered by `created_at` descending, limited to the most recent 50

#### Scenario: GET /api/notifications with read filter
- **WHEN** an authenticated user calls `GET /api/notifications?unread=true`
- **THEN** the system SHALL return only notifications where `read = false`

#### Scenario: PATCH /api/notifications/[id] marks as read
- **WHEN** an authenticated user calls `PATCH /api/notifications/{id}` with `{ "read": true }`
- **THEN** the system SHALL update the notification's `read` field to true

#### Scenario: PATCH /api/notifications/read-all marks all as read
- **WHEN** an authenticated user calls `PATCH /api/notifications/read-all`
- **THEN** the system SHALL set `read = true` for all of the user's unread notifications

### Requirement: NotificationBell reads from API
The `NotificationBell` component SHALL read notifications from the API instead of localStorage, with localStorage as a fallback during migration.

#### Scenario: API notifications available
- **WHEN** `NotificationBell` mounts and the notifications API is reachable
- **THEN** it SHALL display notifications from the API and show the unread count badge

#### Scenario: API unavailable, localStorage fallback
- **WHEN** the notifications API request fails
- **THEN** `NotificationBell` SHALL fall back to reading from localStorage (existing behavior)

#### Scenario: Dismiss notification
- **WHEN** a user dismisses a notification in the bell dropdown
- **THEN** the system SHALL call `PATCH /api/notifications/{id}` to mark it as read

### Requirement: Notification cleanup prevents unbounded growth
The system SHALL periodically remove old notifications to prevent table growth.

#### Scenario: Notifications older than 30 days
- **WHEN** the monitor-subscriptions cron runs
- **THEN** the system SHALL delete notifications where `created_at < NOW() - 30 days` before processing sources
