## Context

The scrape feature processes YouTube videos in parallel batches of 5 with a 50s batch timeout. Videos without captions fall through to Gemini `video/youtube` transcription, which takes ~60-70s per video. Verified: the Gemini API key works (200 response, ~68s for a single video). The issue is purely timeout management — parallel transcription calls exceed the batch timeout, and the batch timeout doesn't abort in-flight `processUrl` calls. Additionally, the `ScrapeProgress` component only auto-redirects on completion and has no "start over" affordance, trapping users on step 3. Recent tasks cards render blank because `getScrapeJobsByUser` doesn't join KOL data.

## Goals / Non-Goals

**Goals:**
- No-caption YouTube videos successfully transcribe via Gemini without timing out
- User always has a clear exit from step 3 (completion summary or start over)
- Recent tasks show meaningful information (KOL name, date, import/error counts)

**Non-Goals:**
- Changing Gemini model or adding alternative transcription services
- Redesigning the scrape flow or adding retry logic for failed jobs
- Optimizing Gemini API call speed

## Decisions

### 1. Serialize transcription-heavy URLs instead of parallel batches

**Decision:** Process no-caption YouTube URLs sequentially (batch size = 1) within `processJobBatch`, while keeping caption-available and text URLs at the current batch size. Increase `TRANSCRIPTION_TIMEOUT_MS` from 120s to 180s.

**Rationale:** The core problem is 5 parallel 70s calls = batch hangs for 70s, exceeding the 50s batch timeout. Alternatives considered:
- *Increase batch timeout to 180s* — breaks Vercel's 60s function limit in production
- *Abort in-flight fetches when batch times out* — complex, loses partial work
- *Separate transcription queue* — over-engineered for now
- *batchSize=1 for all URLs* — too slow for caption-available videos

Serializing only no-caption URLs keeps throughput high for the common case (videos with captions) while preventing timeout issues for the expensive path. The `continue` endpoint will process one transcription per cycle, taking ~70s in dev (acceptable) and staying under Vercel limits with `timeoutMs=55_000`.

### 2. Show completion summary card instead of instant redirect

**Decision:** Replace auto-redirect with a completion summary card showing:
- Import counts (success, errors, filtered, duplicates)
- "View KOL" button (primary) + "Start Over" button (outline)
- If `importedCount === 0`, emphasize that no credits were consumed (since scrape is quota-exempt and the only credits are for failed transcription which gets refunded)

The flow chart transitions to step 4 when the job is `completed` or `failed`, regardless of error count.

**Rationale:** Auto-redirect is disorienting when all URLs errored — user lands on KOL page with no new posts and no explanation. A summary card provides closure and actionable next steps.

### 3. Enrich job query with KOL name via join

**Decision:** Modify `getScrapeJobsByUser` in the repository to join through `kol_sources → kols` to get `kol_name`. Add `kolName`, `completedAt` to the returned job objects.

**Rationale:** The data relationship already exists (`scrape_jobs.kol_source_id → kol_sources.kol_id → kols.name`). A single join is the simplest fix. Display format: `KOL Name • 2026-03-16 • 1 imported, 4 errors`.

## Risks / Trade-offs

- **Serialized transcription is slower** — a batch of 5 no-caption videos now takes 5×70s = ~6 minutes instead of ~70s parallel. → Acceptable: this is rare (most KOLs have captions), and reliability > speed.
- **Completion summary adds one click** — user must click "View KOL" instead of auto-redirecting. → Better UX overall: user sees what happened before navigating.
