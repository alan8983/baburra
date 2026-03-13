# Proposal: Scrape Flow Chart + Queue System

## What

Add an interactive flow chart to the Scrape page that visually communicates the scraping pipeline stages, and introduce a queue-aware UI that keeps users informed when processing large batches (50+ videos/tweets for Pro users).

## Why

1. **User engagement** — The current scrape page is a simple form + progress bar. A visual flow chart showing the pipeline stages (URL discovery -> transcript extraction -> AI analysis -> import) helps users understand what the system is doing and keeps them engaged during long waits.

2. **Scalability communication** — Pro users scraping 50+ items can face 25-45 minute waits. Without clear queue positioning and stage visibility, users may think the system is broken or leave the page. The queue UI communicates position, estimated wait time, and allows background processing with notifications.

3. **Notification hook** — When users navigate away during long scrapes, they need to be notified upon completion. The localStorage-based notification system already exists but needs a proper in-app notification bell/dropdown that surfaces completed scrape jobs globally.

## Scope

- **Scrape flow chart component** — Visual 4-step pipeline displayed on the scrape page (above the form and during progress)
- **Queue position indicator** — Shows position in queue when multiple jobs are pending
- **Notification bell component** — Global header notification icon that shows unread scrape completions
- **Enhanced progress UI** — Flow chart steps animate as the job progresses through stages

## Out of Scope

- Push notifications (browser Notification API) — future enhancement
- WebSocket real-time updates — continue using polling
- Backend queue changes — the existing DB-backed queue + cron is sufficient
- Payment/tier enforcement for Pro limits
