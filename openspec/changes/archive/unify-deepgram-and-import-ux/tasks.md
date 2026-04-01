## 1. Deepgram Client Hardening

- [x] 1.1 Add retry logic to `deepgramTranscribe()` — 2 retries with 5s/15s exponential backoff for transient errors (503, 429, network, timeout); fail immediately for 400/401/403
- [x] 1.2 Fix Nova-2 → Nova-3 comment mismatch in `deepgram.client.ts` (lines 2, 68) and `import-pipeline.service.ts` (line 232)
- [x] 1.3 Add unit tests for retry behavior: verify retryable vs non-retryable errors, verify backoff delays, verify max 3 total attempts

## 2. Unify Transcription on Deepgram

- [x] 2.1 Remove `geminiTranscribeVideo()` function and helpers (`getMaxOutputTokens`, dynamic timeout logic) from `gemini.client.ts`
- [x] 2.2 Remove `LONG_VIDEO_THRESHOLD_SECONDS` constant and duration-based routing (`isLongVideo` branching) from `import-pipeline.service.ts`
- [x] 2.3 Update pipeline: all captionless YouTube videos go through `downloadYoutubeAudio()` → `deepgramTranscribe()` regardless of duration
- [x] 2.4 Update transcript cache `source` field: remove `'gemini'` source, all new transcriptions saved as `'deepgram'`
- [x] 2.5 Run `npm run type-check` and fix any type errors from removed Gemini transcription code

## 3. Credit Economy Adjustment

- [x] 3.1 Update `CREDIT_COSTS.video_transcription_per_min` from 7 to 5 in `src/domain/models/user.ts`
- [x] 3.2 Update `CREDIT_LIMITS.free` from 850 to 700 in `src/lib/constants/tiers.ts`
- [x] 3.3 Create DB migration: update default `credit_balance` for free tier to 700; update `consume_credits` and weekly-reset functions to use 700 as free tier cap
- [ ] 3.4 Push migration with `supabase db push` (with user confirmation)
- [x] 3.5 Update any unit tests that reference old credit values (850 or 7/min)

## 4. Post-Transcription Credit Reconciliation

- [x] 4.1 Add `extractActualDuration()` helper to parse last utterance `end` timestamp from Deepgram formatted transcript
- [x] 4.2 Add `reconcileTranscriptionCredits()` function in `ai-usage.repository.ts` — compare actual vs estimated duration, refund/charge if >20% difference
- [x] 4.3 Integrate reconciliation into pipeline after `deepgramTranscribe()` returns, before sentiment analysis — wrapped in try/catch (never blocks pipeline)
- [x] 4.4 Add unit tests for reconciliation: threshold check, refund path, additional charge path, failure resilience

## 5. Time Estimation

- [x] 5.1 Create `estimateImportTime()` utility in `src/lib/utils/` — takes parsed URLs with platform/duration/caption info, returns per-URL and batch estimates in seconds
- [x] 5.2 Add pre-import URL metadata fetching in `ImportForm` — detect platform, check caption availability, get duration for YouTube URLs (lightweight metadata call)
- [x] 5.3 Display time estimate alongside credit cost in `ImportForm` confirmation area: "600 credits · ~1.5 min"
- [x] 5.4 Add unit tests for time estimation logic: video, captioned, text, mixed batch (parallel max)

## 6. Non-Blocking Import UX

- [x] 6.1 Create `useImportStatusStore` Zustand store in `src/stores/` — tracks import jobs with per-URL status (queued/processing/success/error), startedAt, estimatedSeconds
- [x] 6.2 Create `ImportStatusToast` component — persistent toast with per-URL status, progress bar, time estimate, collapsible to badge, auto-dismiss after 10s post-completion
- [x] 6.3 Mount `ImportStatusToast` in app layout (`src/app/(app)/layout.tsx`) so it renders on all protected pages
- [x] 6.4 Refactor `useImportBatch` hook — on submit: close form, update Zustand store, fire mutation in background; on progress: update per-URL status; on complete: update store with results
- [x] 6.5 Remove `ImportLoadingOverlay` component and all references to it
- [x] 6.6 Update `ImportForm` to close immediately on submit (no longer waits for API response)
- [ ] 6.7 Verify toast persists across page navigations (manual test: submit import → navigate to /kols → navigate to /posts → verify toast still visible)

## 7. Validation & Cleanup

- [x] 7.1 Run full test suite (`npm test`) — fix any failures
- [x] 7.2 Run type check (`npm run type-check`) — fix any errors
- [x] 7.3 Run lint + format (`npm run lint:fix && npm run format`)
- [ ] 7.4 Manual E2E test: import 1 short video (< 30 min) + 1 long video (> 30 min) + 1 text URL — verify all transcribed via Deepgram, credits correct, toast works, results accurate
- [ ] 7.5 Verify transcript cache works: re-import same video URL — should hit cache, no Deepgram call
