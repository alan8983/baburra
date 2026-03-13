# Proposal: Scrape Flow Chart + Queue System

## What

Remake the entire Scrape page as a 5-step guided workstream with an interactive flow chart, URL selection preview, queue-aware processing, and auto-redirect on completion.

## Why

1. **User engagement** — The current scrape page is a simple form + progress bar. A visual flow chart showing pipeline stages keeps users engaged during long waits and helps them understand what the system is doing.

2. **User control** — Currently, submitting a URL immediately scrapes everything discovered. Users should see the discovered URLs first and be able to deselect ones they don't want, giving them control over what gets processed.

3. **Scalability communication** — Pro users scraping 50+ items can face 25-45 minute waits. A queue position indicator and ETA keeps users informed. A notification bell lets them navigate away and get notified on completion.

## The 5-Step Workstream

```
[1. Input URL] → [2. Discover & Select] → [3. Process (queued)] → [4. Import & Notify] → [5. Auto-redirect]
```

1. **Input URL** — User pastes a YouTube channel or Twitter/X profile URL (existing form)
2. **Discover & Select** — System discovers available content URLs, displays them with checkboxes. User deselects unwanted items and confirms to proceed. **This is a new step requiring backend changes.**
3. **Process (Extract + AI Analysis)** — Batch extraction and AI analysis with queue position indicator and progress bar. Extraction and AI analysis happen together per-URL (no backend separation).
4. **Import & Notify** — Posts imported, toast notification fired, notification bell updated in header.
5. **Auto-redirect** — Immediately redirect to the KOL's detail page on completion.

## Scope

- **Scrape flow chart component** — 5-step pipeline visualization that replaces the form during processing
- **URL discovery & selection UI** — New step 2 with checklist of discovered URLs
- **Backend split** — New `/api/scrape/discover` endpoint for discovery-only, existing `/api/scrape/profile` modified to accept selected URLs
- **Queue position indicator** — Per-user queue position (own jobs only)
- **Notification bell** — Global header notification for scrape completions (localStorage-based)
- **Auto-redirect** — Immediate redirect to KOL page on completion

## Out of Scope

- Push notifications (browser Notification API) — future enhancement
- WebSocket real-time updates — continue using polling
- Global queue position (cross-user) — per-user only
- Payment/tier enforcement for Pro limits
