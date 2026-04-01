## Context

The import pipeline currently has two video transcription paths: Gemini `file_uri` (≤30 min) and Deepgram Nova-3 (>30 min). The Gemini path was the original implementation; Deepgram was added to fix a server-side socket bug affecting long videos. Exploration revealed Deepgram is cheaper ($0.0077/min vs ~$0.01-0.03/min), produces richer output (speaker diarization + timestamps), and has a simpler dependency chain (we control the audio download, Gemini's file_uri has an opaque 3-step server-side fetch+transcode+inference chain).

The import UX uses a full-screen blocking overlay with fake progress animation (2.5s timer-based steps unrelated to actual pipeline progress). Users cannot navigate, queue more work, or even see their dashboard while waiting 30-150s per import.

Credit economy was calibrated for Gemini costs. With Deepgram unified, the actual API cost per minute drops significantly, allowing us to lower the per-minute credit charge and resize the free tier pool.

## Goals / Non-Goals

**Goals:**
- Single transcription path (Deepgram) for all captionless videos — simpler, cheaper, richer output
- Robust Deepgram client with retry logic matching existing Gemini patterns
- Non-blocking import UX — users can browse freely during import, see real-time per-URL progress
- Time estimation shown alongside credit cost before import confirmation
- Credit economy adjusted: 5 credits/min, 700 free credits/week (Option C from cost analysis)
- Accurate credit charging via post-transcription reconciliation

**Non-Goals:**
- Server-side job queue for imports (Phase 2 — current change uses client-side Zustand state)
- Cross-session persistence of import status (requires job table — future work)
- Changing Pro/Max tier credit limits (only free tier adjusts in this change)
- Supporting non-YouTube video platforms (unchanged)
- Changing the sentiment analysis or argument extraction pipeline (Gemini flash-lite stays)

## Decisions

### D1: Unify all video transcription on Deepgram Nova-3

**Choice**: Remove `geminiTranscribeVideo()` entirely. All captionless YouTube videos use: yt-dlp audio download → Deepgram POST.

**Alternatives considered**:
- Keep dual path, just add Deepgram retry → Maintains complexity, Gemini socket bug still latent for edge cases
- Use Deepgram only as fallback when Gemini fails → Still pays Gemini cost first, adds latency on failure

**Rationale**: Deepgram is cheaper (2-7×), gives speaker labels + timestamps (better for investment context — who said what), and removes the opaque Gemini server-side dependency chain. The ~10s yt-dlp download overhead for short videos is offset by Deepgram's faster transcription (~1s/min vs Gemini's 20-30s for short videos).

### D2: Deepgram retry strategy — 2 retries, exponential backoff

**Choice**: Retry transient errors (HTTP 503, 429, network errors, timeouts) up to 2 times with 5s/15s delays. Non-retryable errors (400, 401, 403) fail immediately.

**Implementation**:
```
deepgramTranscribe()
  ├─ Attempt 1 → success? → return
  ├─ Retryable failure? → wait 5s
  ├─ Attempt 2 → success? → return
  ├─ Retryable failure? → wait 15s
  └─ Attempt 3 → success? → return / throw
```

**Rationale**: Matches the existing Gemini retry pattern (proven in production). 5s/15s delays give Deepgram time to recover from transient load issues without excessive total wait time (~20s max retry overhead).

### D3: Non-blocking import via Zustand store + persistent toast

**Choice**: Client-side state management with Zustand. Import mutation fires and immediately returns control to user. State persists across SPA page navigations.

**Architecture**:
```
┌────────────────────────────────────────────────────┐
│  ImportForm                                         │
│  ├─ Shows credit cost + time estimate              │
│  ├─ On submit: dispatch to useImportBatch()         │
│  └─ Close form immediately                         │
└────────────────────┬───────────────────────────────┘
                     │ fires mutation
                     ▼
┌────────────────────────────────────────────────────┐
│  useImportBatch (React Query mutation)              │
│  ├─ Updates Zustand store: status per URL          │
│  ├─ API still synchronous (POST /api/import/batch) │
│  └─ On complete: update store with results          │
└────────────────────┬───────────────────────────────┘
                     │ reads
                     ▼
┌────────────────────────────────────────────────────┐
│  Zustand: useImportStatusStore                      │
│  ├─ importJobs: Map<batchId, ImportJob>            │
│  │   └─ urls: [{url, status, result}]              │
│  │   └─ startedAt, estimatedSeconds                │
│  └─ Persists across SPA navigation (in-memory)     │
└────────────────────┬───────────────────────────────┘
                     │ subscribes
                     ▼
┌────────────────────────────────────────────────────┐
│  ImportStatusToast (global, in layout)              │
│  ├─ Rendered in app layout (always visible)        │
│  ├─ Shows: progress bar, per-URL status            │
│  │   ✅ twitter.com/...  done (3s)                 │
│  │   🔄 youtube.com/...  transcribing...           │
│  │   ⏳ twitter.com/...  queued                    │
│  ├─ Collapsible (minimize to small badge)          │
│  └─ Auto-dismiss after results shown for 10s       │
└────────────────────────────────────────────────────┘
```

**Alternatives considered**:
- Server-side job queue (like scrape system) → Robust but heavy; requires new DB table, polling endpoint, cron worker. Overkill for 1-5 URL batches that complete in <3 min.
- WebSocket/SSE for real-time progress → API doesn't stream per-URL results yet; would need significant backend refactoring.

**Rationale**: Zustand is already in the project (`src/stores/`). Client-side state solves 90% of the UX pain (navigate while waiting) with minimal backend changes. The API contract stays the same — the mutation just runs in the background instead of blocking the UI.

### D4: Time estimation algorithm

**Choice**: Estimate per-URL processing time based on platform, caption availability, and video duration. Show as "Est. ~X min" next to credit cost.

**Logic**:
```typescript
function estimateSeconds(url: ParsedUrl): number {
  if (url.platform !== 'youtube') return 5;           // text: ~3-5s
  if (url.hasCaptions) return 8;                       // caption: ~5-8s
  const minutes = Math.ceil((url.durationSeconds || 600) / 60); // default 10 min
  const downloadTime = 12;                             // yt-dlp ~10-15s
  const transcribeRate = 1;                            // Deepgram ~1s/min
  const analysisTime = 15;                             // sentiment + arguments
  return downloadTime + (minutes * transcribeRate) + analysisTime;
}

// Batch estimate: parallel processing → take max, not sum
const batchEstimate = Math.max(...urls.map(estimateSeconds));
```

**Display**: Before confirmation, show alongside credits: "12 credits · ~2 min"

### D5: Credit economy — Option C (5/min, 700 pool)

**Choice**: `CREDIT_COSTS.video_transcription_per_min` = 5, `CREDIT_LIMITS.free` = 700.

**Rationale** (from cost analysis):
- Actual Deepgram cost: $0.0077/min → 5 credits/min gives $0.00154/credit
- 120 min target (2 Gooaye videos) = 600 credits, leaving 100 for extras (articles + captioned YT)
- Max free user cost: $4.82/month (lowest of 3 options analyzed)
- Breakeven: ~4 Pro users per free user at worst case; ~4.4 free per Pro at $14.99/mo with 30% active rate

**Migration**: DB migration updates `credit_balance` default. Existing free users keep current balance until next weekly reset.

### D6: Post-transcription credit reconciliation

**Choice**: After Deepgram returns, extract actual duration from the last utterance's `end` timestamp. If actual duration differs from estimate by >20%, adjust credits (charge more or refund difference).

**Implementation**:
```
Pre-transcription:  charge estimated credits (Math.ceil(estimatedMinutes) × 5)
Post-transcription: actual_minutes = last_utterance.end / 60
                    actual_cost = Math.ceil(actual_minutes) × 5
                    delta = actual_cost - estimated_cost
                    if delta > 0: consume additional credits (or warn if insufficient)
                    if delta < 0: refund |delta| credits
```

**Threshold**: Only reconcile if |delta| > 20% of original estimate — avoid micro-adjustments for rounding differences.

## Risks / Trade-offs

**[yt-dlp dependency for short videos]** → Short videos now require audio download (~10-15s overhead). Mitigation: Deepgram transcription is faster than Gemini's server-side processing, roughly offsetting the download time. Net latency change is minimal.

**[/tmp disk space on Vercel]** → All videos now download audio to `/tmp`. Concurrent imports could fill the 500MB limit. Mitigation: Files are cleaned up after each transcription. Sequential processing in scrape pipeline limits concurrency. For imports (max 5 parallel), worst case = 5 × ~50MB = 250MB, well within limits.

**[Zustand state lost on tab close]** → If user closes browser tab during import, they lose visibility of the running import. The API call still completes server-side, posts are still created — user just won't see the toast results. Mitigation: React Query cache will reflect new posts on next page load. This is an acceptable trade-off for Phase 1; server-side job queue (Phase 2) would survive tab close.

**[Credit reconciliation complexity]** → Post-transcription adjustment adds a second credit transaction. Mitigation: Wrap in try/catch; if reconciliation fails, log and continue (user was already charged the estimate, which is close enough). Never block post creation on reconciliation failure.

**[Existing free users with 850 balance]** → Lowering default to 700 doesn't retroactively reduce existing balances. Users keep current balance until next weekly reset, which will set them to 700. No immediate disruption.

## Open Questions

- **Q1**: Should the toast support cancellation? (Kill the in-flight API request via AbortController.) Leaning no for Phase 1 — the API call completes quickly enough and cancellation adds edge cases around partial credit refunds.
- **Q2**: Should we show Deepgram speaker labels in the stored transcript, or strip them before sentiment analysis? Speaker context could help Gemini identify who holds what opinion, but adds noise to the prompt.
