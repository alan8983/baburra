# Design: Scrape Flow Chart + Queue System

## Architecture

### 1. Scrape Flow Chart Component

**`src/components/scrape/scrape-flow-chart.tsx`**

A visual 4-step horizontal pipeline that shows the scraping stages:

```
[1. Discover URLs] → [2. Extract Content] → [3. AI Analysis] → [4. Import]
```

- Each step shows an icon, label, and status (pending/active/completed)
- During active scraping, the current step pulses/animates
- Steps transition based on job progress data (processedUrls vs totalUrls)
- Displayed above the form when idle (educational), and during processing (live status)

Stage mapping from job data:
- `queued` status → Step 1 active (Discover)
- `processing` + processedUrls === 0 → Step 2 active (Extract)
- `processing` + processedUrls > 0 → Step 3 active (AI Analysis) — since extraction + analysis happen per-URL
- `completed` → All steps completed
- `failed` → Current step shows error state

### 2. Queue Position Indicator

**Integrated into `scrape-progress.tsx`**

When a job is `queued`, show queue position by counting jobs ahead:
- Use existing `useScrapeJobs()` to count jobs with `queued` or `processing` status created before the current job
- Display: "Your job is #N in the queue" with estimated wait time
- This is a UI-only calculation — no new API needed

### 3. Notification Bell Component

**`src/components/layout/notification-bell.tsx`**

A bell icon in the app header that:
- Reads localStorage for `scrape_completed_*` keys (already written by scrape-progress.tsx)
- Shows unread count badge
- Dropdown lists recent completions with "View KOL" action
- Clicking marks as read (removes from localStorage)
- Hook: `src/hooks/use-notifications.ts` — manages localStorage notifications with polling

### 4. Enhanced Scrape Page Layout

Updated `src/app/(app)/scrape/page.tsx`:
- Flow chart displayed above the main content area
- When no active job: flow chart in "educational" mode showing the pipeline
- When active job: flow chart animates with live progress
- Queue position shown when job is queued

## Component Tree

```
ScrapePage
├── ScrapeFlowChart (pipeline visualization)
│   ├── FlowStep (icon + label + status) × 4
│   └── FlowConnector (animated arrows) × 3
├── ProfileScrapeForm | ScrapeProgress (existing, conditional)
│   └── QueuePosition (new, shown when queued)
└── Recent Jobs Card (existing)

AppSidebar (existing)
└── NotificationBell (new, in header)
    └── NotificationDropdown
```

## Data Flow

- No new API endpoints needed
- No new database tables needed
- Queue position calculated client-side from existing `useScrapeJobs()` data
- Notifications use existing localStorage pattern from `scrape-progress.tsx`
- Flow chart state derived from `ScrapeJob.status` + `processedUrls`/`totalUrls`

## i18n

New keys in `src/messages/{locale}/scrape.json`:
- `flowChart.step1` through `flowChart.step4` (labels + descriptions)
- `queue.position`, `queue.estimatedWait`
- `notifications.title`, `notifications.empty`, `notifications.scrapeComplete`
