# Design: Scrape Flow Chart + Queue System

## 5-Step Workstream Architecture

### Step Flow

```
[1. Input URL] → [2. Discover & Select] → [3. Process (queued)] → [4. Import & Notify] → [5. Auto-redirect]
```

The scrape page becomes a single-page wizard. The flow chart is always visible at the top, with the content area below changing based on the current step.

---

### 1. Flow Chart Component

**`src/components/scrape/scrape-flow-chart.tsx`**

A horizontal 5-step stepper (similar to `input-wizard-stepper.tsx`) with:
- Step icons, labels, and connector lines
- States: pending, active (pulsing), completed (check mark), error (red)
- Always visible at the top of the scrape page

Steps:
1. Input URL — `Link` icon
2. Discover & Select — `ListChecks` icon
3. Processing — `Cog` icon
4. Import — `Download` icon
5. Complete — `CheckCircle` icon

---

### 2. Backend Changes

#### New API: `POST /api/scrape/discover`

Discovers URLs from a profile without creating a scrape job.

**Request:** `{ profileUrl: string }`
**Response:**
```json
{
  "kolName": "Channel Name",
  "kolAvatarUrl": "https://...",
  "platform": "youtube",
  "platformId": "UC...",
  "platformUrl": "https://youtube.com/@...",
  "discoveredUrls": [
    { "url": "https://youtube.com/watch?v=...", "title": "Video Title", "publishedAt": "2026-01-01" }
  ],
  "totalCount": 47
}
```

Implementation: Extract the discovery phase from `initiateProfileScrape()` into a new `discoverProfileUrls()` function in `profile-scrape.service.ts`. This calls `extractor.extractProfile()` and returns the raw data without creating KOL, source, or job records.

The YouTube channel extractor already returns `postUrls` — we need to also return titles and publish dates if available from the extractor. If not available, return just URLs with index-based display.

#### Modified API: `POST /api/scrape/profile`

Now accepts an optional `selectedUrls` array. If provided, only those URLs are queued for processing (instead of all discovered URLs).

**Request:** `{ profileUrl: string, selectedUrls?: string[] }`

The existing `initiateProfileScrape()` function is modified to accept an optional `selectedUrls` parameter. If provided, it uses those instead of all discovered URLs.

---

### 3. URL Discovery & Selection UI (Step 2)

**`src/components/scrape/url-discovery-list.tsx`**

After the user submits a URL in Step 1, the system calls `/api/scrape/discover` and transitions to Step 2:

- Shows KOL name + avatar at the top
- Checklist of all discovered URLs with:
  - Checkbox (checked by default)
  - Video/post title (or URL if title unavailable)
  - Published date (if available)
  - "Select All / Deselect All" toggle
- URL count summary: "47 videos found, 47 selected"
- "Start Scraping" button (disabled if 0 selected)
- "Back" button to return to Step 1

---

### 4. Processing UI (Step 3)

**Enhanced `src/components/scrape/scrape-progress.tsx`**

When the user confirms in Step 2, the system calls `/api/scrape/profile` with `selectedUrls` and transitions to Step 3:

- Progress bar with percentage
- Detailed stats (processed/total, imported, duplicates, errors)
- ETA calculation (existing)
- **Queue position indicator** (new):
  - Calculated client-side from `useScrapeJobs()` — count user's own jobs with `queued` or `processing` status created before the current job
  - Display: "Position #N in your queue" with estimated wait
  - Only shown when status is `queued`

---

### 5. Import & Notify (Step 4) + Auto-redirect (Step 5)

These happen automatically:
- When job status transitions to `completed`:
  1. Toast notification fires (existing behavior)
  2. localStorage notification written (existing behavior)
  3. **Immediately redirect** to `ROUTES.KOL_DETAIL(kolId)` via `router.push()`
- No intermediate "completed" screen — straight to KOL page

---

### 6. Notification Bell

**`src/components/layout/notification-bell.tsx`**

Replaces the hardcoded bell icon in `header.tsx`:
- Reads localStorage for `scrape_completed_*` keys (already written by scrape-progress.tsx)
- Shows unread count badge (red dot with number)
- Click opens dropdown with recent completions:
  - KOL name, imported count, timestamp
  - "View KOL" link
  - "Dismiss" action (removes from localStorage)
- Empty state: "No notifications"

**`src/hooks/use-notifications.ts`**
- Polls localStorage every 10s for `scrape_completed_*` keys
- Returns `{ notifications, unreadCount, dismiss, dismissAll }`

---

## Page State Machine

```
ScrapePage state = 'input' | 'discovering' | 'selecting' | 'processing' | 'redirecting'

input       → user submits URL     → discovering
discovering → discover API returns → selecting
selecting   → user clicks confirm  → processing
processing  → job completed        → redirecting
redirecting → router.push()        → KOL detail page

Any step    → user clicks back     → previous step (where applicable)
Any step    → error                → show error, allow retry
```

## Component Tree

```
ScrapePage
├── ScrapeFlowChart (5-step stepper, always visible)
├── Content Area (conditional on state):
│   ├── ProfileScrapeForm (state: input)
│   ├── Discovering spinner (state: discovering)
│   ├── UrlDiscoveryList (state: selecting)
│   ├── ScrapeProgress + QueuePosition (state: processing)
│   └── Redirecting spinner (state: redirecting)
└── Recent Jobs Card (always visible below)

Header (existing)
└── NotificationBell (replaces hardcoded bell)
```

## Data Flow

### New API Endpoints
- `POST /api/scrape/discover` — Discovery only, no side effects
- Modified `POST /api/scrape/profile` — Accepts optional `selectedUrls`

### New Hooks
- `useDiscoverProfile()` — Mutation calling discover API
- `useNotifications()` — localStorage notification management

### No Database Changes
- No new tables
- No schema migrations
- Queue position is client-side calculation

## i18n

New keys in `src/messages/{locale}/scrape.json`:
- `flowChart.step1` through `flowChart.step5` (labels)
- `discover.title`, `discover.found`, `discover.selected`, `discover.selectAll`, `discover.deselectAll`, `discover.confirm`, `discover.back`
- `queue.position`, `queue.estimatedWait`
- `notifications.title`, `notifications.empty`, `notifications.scrapeComplete`, `notifications.dismiss`, `notifications.dismissAll`
