# Fix ScrapeProgress Live Rendering Race Condition

## Problem

The `ScrapeProgress` component stays stuck showing "排隊中 0/2" even after the backend job completes and the API returns `status: completed, processedUrls: 2`. After a page reload, the "最近的任務" section correctly shows "完成".

## Observed Behavior (QA Session 2026-03-18)

1. User starts scrape with 2 URLs via profile scrape flow
2. `useScrapeJob` polls `/api/scrape/jobs/:id` — first poll returns `status: queued`
3. Poll triggers fire-and-forget `/continue` call which processes both URLs (~17s)
4. Next poll returns `status: completed, processedUrls: 2, importedCount: 1`
5. **BUG**: UI still shows "排隊中" badge and "0/2 已分析" text
6. Polling correctly stops (status is no longer queued/processing)
7. After page reload, job appears correctly in "最近的任務" as "完成"

## Root Cause (Hypothesis)

The `ScrapeProgress` component likely caches local state derived from the first poll response and doesn't re-derive it when React Query returns updated data. The `prevStatusRef` transition detection may miss the `queued → completed` jump if intermediate states are skipped.

## Scope

- Fix `src/components/scrape/scrape-progress.tsx` to correctly render when job status jumps directly from `queued` to `completed`
- Ensure the component re-renders with latest data from `useScrapeJob`

## Impact

Medium — users must reload the page to see scrape results. The backend works correctly.
