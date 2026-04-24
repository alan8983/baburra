# Scenarios — Gooaye-Scale Podcast Import

**Seed:** 100 Gooaye episodes (avg ~45 min) scraped via RSS → Deepgram → Gemini, batch-size 3, Gemini key pool of 3 keys
**Focus:** failures · **Domain:** software · **Iterations:** 25 · **Commit:** `3f6d016`

Dimensions: `concurrent`, `scale`, `recovery`, `temporal`, `composite` (cross-dimension).

---

## Dimension: concurrent (S-01 to S-06)

### S-01 · SoundOn rate-limits RSS feed at burst of 3 identical GETs
**Given** batch-size 3, all 3 workers enter `podcast.extractor.extract()` within 100ms.
**When** each calls `fetch(feedUrl)` for the same 1.5 MB feed.
**Then** SoundOn's CDN returns 429 on requests 2+3 (or socket-resets them). Predicted 429 rate at B=3: 30–60%; at B=10: ≥90%.
**Source:** predict F-01. **Injection cost:** free — observable in real run.

### S-02 · Gemini `cooldownQueue` serializes all parallel Gemini calls
**Given** 3 episodes complete transcription simultaneously, each needs analysis + 3× argument extraction.
**When** 12 concurrent Gemini calls hit the shared `cooldownQueue` at `gemini.client.ts:127`.
**Then** wall time = 12 × 1.5s = 18s just for the mutex, regardless of 3-key pool.
**Source:** predict F-02. **Injection cost:** free — measure stage `gemini_*` p50/p95 in summary.json.

### S-03 · Two concurrent episodes both hit same `findKolByName` race
**Given** two workers hit `import-pipeline.service.ts:654` for the same auto-detected KOL.
**When** both find nothing and call `createKol({ name })`.
**Then** second insert hits unique-constraint violation; current code doesn't catch.
**Note:** For seed runs, `knownKolId` is passed in (line 499) so the KOL-creation race is bypassed. For non-seed batch imports with auto-detect, race is real.

### S-04 · Progress-flush chain interleaves and reports stale counts
**Given** 3 tasks finish in quick succession at T, T+5ms, T+10ms.
**When** each calls `flushProgress()` → chain serializes DB writes.
**Then** each write carries a fresh snapshot; monotonic ordering is preserved — **no bug**, confirmed safe by design (L457-471). Negative-test confirmed.

### S-05 · Deepgram long-transcription + short-transcription concurrent → quota pressure
**Given** 2 long eps (~50 min each) + 1 short ep all in flight.
**When** Deepgram's pay-as-you-go concurrent-request tolerance tested.
**Then** at PayG, Deepgram tolerates ~50 concurrent; B=3 for this pipeline has zero concurrency pressure. **Low risk given tier.**

### S-06 · Two instances of the script running simultaneously
**Given** operator (re)starts scrape while a prior invocation still runs.
**When** both call `initiateProfileScrape` with same `seed` source — `findOrCreateSource` picks the same row, same `kolId`.
**Then** both drive `processJobBatch` for the same `jobId`. `Promise.all` in each instance runs the same URL set; `findPostBySourceUrl` catches dups; both progress counters race to write to DB. **Counter race — importedCount could undercount by 1–3 but DB-row correctness preserved.** Document as "do not run two at once" in the script.

---

## Dimension: scale (S-07 to S-12)

### S-07 · 100 episodes × ~300 RSS feed re-fetches exceeds SoundOn's unwritten daily limit
**Given** seed run traffic + repeat-runs during tuning.
**When** ≥5 full runs in a 24-hour window.
**Then** SoundOn may issue a longer block; scraping halts entirely.
**Source:** predict F-01 amplified over time.

### S-08 · Audio buffer heap pressure at batch-size 10
**Given** `--batch-size 10` with 50 MB avg audio per episode.
**When** all 10 downloads complete before any transcription finishes.
**Then** heap ≈ 500 MB + Node runtime → total ~800 MB. Default `max-old-space-size=4GB` not hit. GC pauses may add 200-500ms latency per cycle.
**Source:** predict F-05.

### S-09 · Transcript table row count growth from 100 × 50-min transcripts
**Given** avg transcript ≈ 8 KB text (Chinese, ~5000 chars/15-min block scaled).
**When** 100 rows inserted.
**Then** ~800 KB in `transcripts`. Negligible for Postgres.

### S-10 · 100-ep run produces ~400-600 post_arguments rows at quality
**Given** avg ~3-5 tickers per ep × ~3 arguments per ticker.
**When** all succeed.
**Then** ~1000-1500 new `post_arguments` rows. Within RLS / index cost budget.

### S-11 · Seed script keeps logs forever — 26 MB JSONL after 100 runs
**Given** each run ≈ 260 KB JSONL (100 entries × ~2.6 KB with timings).
**When** 100 runs accumulate in `scripts/logs/`.
**Then** directory hits 26 MB; never pruned. Cosmetic but grows unbounded.

### S-12 · Gemini daily quota (Flash-Lite free tier) vs 100-ep call count
**Given** ~8 Gemini calls/ep × 100 eps = 800 calls/run × 3 keys = 267/key.
**When** key limit is 1000/day/key.
**Then** comfortable headroom. With `--retry-backoff-ms` tuning and re-runs, could approach limit. Pay-as-you-go is safer.

---

## Dimension: recovery (S-13 to S-18)

### S-13 · SIGINT mid-flight — resume preserves imported counter from DB
**Given** ctrl-C at T+50s with 3 URLs in flight.
**When** SIGINT handler runs `writeFinalSummary` and exits 130.
**Then** in-flight tasks' progress may not have flushed. Restart: `remaining = slice(processedUrls)` uses DB counter. Completed-but-unflushed tasks re-run; `findPostBySourceUrl` catches as duplicate.
**Net:** no data loss, but summary counter shows 1–3 imports as "duplicate" instead.
**Source:** predict F-06.

### S-14 · Transient Deepgram 503 burns 20s + 2 retries
**Given** Deepgram returns 503 on first call of episode X.
**When** retry at 5s → 503 → retry at 15s → success.
**Then** episode X completes 20s later; other episodes unaffected (different limit slots).

### S-15 · Deepgram 429 during batch = cascading failures
**Given** 3 in-flight Deepgram calls all 429 simultaneously.
**When** all retry at 5s — still 429 (account-level limit).
**Then** all retry at 15s — succeeds.
**Net:** 20s delay for all 3; no data loss. Pay-as-you-go makes this low-prob.

### S-16 · Gemini key-pool all-429 = 155s backoff cycle, possibly repeated
**Given** Flash-Lite daily quota exhausted across all 3 keys.
**When** `withModelFallback` iterates all keys×models → backoff 5/15/45/90s.
**Then** each retry iteration is guaranteed to re-fail (no per-key cooldown marker). Total wait ≈ 155s then throws.
**Source:** predict F-04.

### S-17 · Malformed RSS item (missing enclosure) skipped without crashing batch
**Given** one of 100 episodes has `<enclosure>` stripped in the feed.
**When** extractor reaches `if (!enclosureUrl) throw ExtractorError`.
**Then** episode fails with `FETCH_FAILED`; batch continues. **Correct behavior.**

### S-18 · DB connection drops mid-batch
**Given** Supabase session interruption during `createPost`.
**When** `processUrl` catch at L825 throws upward.
**Then** outer `limit()` catch at L518 logs errorCount++, updateScrapeJobItemStage('failed'). Batch continues for other URLs but those that were in-flight during the drop all fail. Recovery: re-run; dedup catches successful ones via `findPostBySourceUrl`.

---

## Dimension: temporal (S-19 to S-22)

### S-19 · Per-minute Gemini quota reset vs 5s backoff mismatch
**Given** Flash-Lite free-tier quota = per-minute window.
**When** 429 at T=0, backoff 5s, retry at T+5s — same quota window, guaranteed 429.
**Then** backoff 15s, retry at T+20s — still within the same minute, possibly another 429. Only T+60s guaranteed to reset.
**Source:** predict F-04.

### S-20 · Long episode ≥ 90 min exceeds podcast MAX_DURATION_SECONDS
**Given** a Gooaye ep > 90 min (rare but possible for specials).
**When** extractor checks `durationSeconds > MAX_DURATION_SECONDS`.
**Then** `CONTENT_TOO_LONG` thrown; batch continues. **Correct — skip ep, log.**
**Note:** `import-pipeline.service.ts` has its own check at L412 with MAX=120min; extractor's 90min is stricter. Behavior: extractor wins for podcast path.

### S-21 · Signed enclosure URL expires between discovery and download
**Given** RSS feed parsed at T=0 with enclosure URL signed for 1-hour expiry.
**When** batch-size 3 means episode 100 is downloaded at T+8000s (2.2h later).
**Then** enclosure URL may 403. Since no retry (F-03), episode permanently fails.
**Injection candidate.**

### S-22 · SoundOn publishes EP601 mid-run
**Given** feed has 100 episodes at T=0, EP501–600 in range.
**When** at T+5000s a new episode is published; feed re-fetch (per F-01) picks it up.
**Then** new episode NOT in `matched` set because that list was built once at script start. **No bug — scope stable.**

---

## Dimension: composite (S-23 to S-25)

### S-23 · F-01 + F-03 compound: RSS 429 → no retry → full ep dropped
**Given** scenario S-01 triggers a 429 on the RSS feed call inside `podcast.extractor.extract()`.
**When** `throw ExtractorError('FETCH_FAILED')` fires with no retry (F-03).
**Then** every episode that hit the 429 window is lost. Expect ~20-40% drop rate at B=10 if SoundOn is strict.
**This is the most critical composite hypothesis for §5.4.**

### S-24 · F-02 + F-04 compound: cooldown serializes 429s, backoff cascades
**Given** one Gemini call 429s and triggers retry.
**When** retry enters the same global `cooldownQueue` — blocks all other Gemini callers.
**Then** a single 429 stalls all 12 in-flight Gemini calls by up to 1.5s each = 18s downtime per 429 event.

### S-25 · Full-matrix partial failure + validation-scoring skipped
**Given** job completes but `importedCount = 0` because all episodes failed.
**When** `handleValidationCompletion(kolId)` runs on `isValidationScrape && kolId` at L574.
**Then** validation scoring runs on 0 posts. Gooaye is already a `verified` KOL (per migration 20260416000002), so this path may not fire. **Check.**

---

## Exploration log (scenario-results.tsv)

```
iter	dimension	scenario_id	predicted_severity	classification	notes
1	concurrent	S-01	high	new	RSS 429 most critical
2	concurrent	S-02	high	new	cooldownQueue mutex
3	concurrent	S-03	medium	variant	Gooaye seed path bypasses via knownKolId
4	concurrent	S-04	low	negative	confirmed safe by design
5	concurrent	S-05	low	new	PayG obviates
6	concurrent	S-06	medium	new	operator convenience
7	scale	S-07	medium	new	multi-day SoundOn ban
8	scale	S-08	medium	variant	expanded from F-05
9	scale	S-09	low	new	transcripts table OK
10	scale	S-10	low	new	DB capacity OK
11	scale	S-11	low	new	log dir grows
12	scale	S-12	low	new	quota headroom fine
13	recovery	S-13	medium	variant	expanded from F-06
14	recovery	S-14	low	new	expected transient
15	recovery	S-15	medium	new	account-level 429
16	recovery	S-16	high	variant	expanded from F-04
17	recovery	S-17	low	new	graceful skip
18	recovery	S-18	medium	new	DB session drop
19	temporal	S-19	high	variant	expanded from F-04
20	temporal	S-20	low	new	stricter cap fine
21	temporal	S-21	medium	new	signed URL expiry → injection candidate
22	temporal	S-22	low	new	scope stable
23	composite	S-23	critical	new	F-01+F-03 compound
24	composite	S-24	high	new	F-02+F-04 compound
25	composite	S-25	low	new	verify-check needed
```

Iterations completed: **25/25**. Stopping per bounded setting.
