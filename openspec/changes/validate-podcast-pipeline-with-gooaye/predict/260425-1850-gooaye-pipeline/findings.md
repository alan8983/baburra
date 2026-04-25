# Findings — Gooaye Podcast Pipeline

Ranked by priority_score = severity·0.4 + confidence·0.2 + consensus·0.4.

---

## F-01: RSS feed re-fetched in full for every single episode

**Severity:** HIGH · **Confidence:** HIGH · **Location:** `src/infrastructure/extractors/podcast.extractor.ts:111` · **Consensus:** 8/8

**Evidence:** `PodcastEpisodeExtractor.extract()` calls `fetch(feedUrl)` for every URL passed in — the RSS XML for all 655 Gooaye episodes (~1–2 MB) is re-downloaded and re-parsed per call. With 100 episodes × concurrency 3, SoundOn sees 100 identical GETs in bursts of 3 within seconds of each other; at concurrency 10, 1000+ identical requests. `scripts/scrape-guyi-podcast-ep501-600.ts:200` also fetches the feed once to discover episodes, meaning episode #1 causes the feed to be fetched TWICE (script + extractor).

**Why it matters for this run:** The single most likely cause of spurious 429s or socket resets on the podcast path. No retry on this fetch (see F-03), so any transient failure kills that episode's processing. The waste also pads wallclock significantly (1–2 MB × ~300 fetches = ~300–600 MB extra traffic).

**Recommendation:** Cache the parsed feed in a module-level `Map<feedUrl, { parsedAt, items }>` with 10-minute TTL inside `podcast.extractor.ts`. One-line fix, removes ~99% of redundant traffic. Alternatively, pass pre-parsed episode data into the extractor via a new optional parameter and populate it from the script.

**Persona votes:** Red Team, Blue Team, Reliability, Performance, Database, Supply Chain, Insider, Devil's Advocate — all confirm.

---

## F-02: Gemini per-call cooldown is a global module-level mutex

**Severity:** HIGH · **Confidence:** HIGH · **Location:** `src/infrastructure/api/gemini.client.ts:115-135` · **Consensus:** 7/8

**Evidence:** `cooldownQueue: Promise<void>` at module scope is shared across ALL Gemini calls in the process. `withModelFallback` → `cooldown()` chains `.then(async () => { ... sleep(COOLDOWN_MS - elapsed) })` onto this single queue. With default `COOLDOWN_MS = 1500`, every concurrent Gemini request serializes: if 3 episodes finish transcription simultaneously and each needs `analyzeDraftContent` + 3× `extractArguments` per episode, that's 12 Gemini calls that must wait ≥1.5s each in sequence = 18s of pure mutex wait. The mutex also defeats the entire point of the 3-key round-robin pool — keys rotate but calls don't parallelize.

**Why it matters for this run:** Caps practical throughput far below API quota. Tuning `--batch-size` upward past ~3 gives diminishing returns because Gemini becomes serial. Directly invalidates the autoresearch tuning premise in §6.

**Recommendation:** Either (a) make cooldown per-key (map keyed on `apiKey`), so each key rate-limits itself but different keys run in parallel — matches the pool's intent; or (b) expose `GEMINI_COOLDOWN_MS=0` as a valid tuning knob in §6 and measure the effect on success_rate vs 429s.

**Persona votes:** Reliability, Performance, Red Team, Blue Team, Database, Insider, Devil's Advocate — confirm. Supply Chain — abstain (outside domain).

---

## F-03: No retry on audio download; no timeout on RSS feed fetch

**Severity:** HIGH · **Confidence:** HIGH · **Location:** `src/infrastructure/extractors/podcast.extractor.ts:194-200` (audio) + `podcast.extractor.ts:111` / `scripts/scrape-guyi-podcast-ep501-600.ts:200` (RSS) · **Consensus:** 7/8

**Evidence:** Line 194 `const audioResponse = await fetch(enclosureUrl)` — single attempt, no retry, no AbortController. A single transient 429/503/socket reset from the SoundOn CDN kills that episode outright. The `ExtractorError` propagates up through `extractFromUrl()` → `processUrl` catch → `errorCount++`. The RSS feed fetches (both in extractor L111 and script L200) also lack AbortController — a hung connection blocks the entire pipeline indefinitely (no outer timeout until the `processJobBatch`-level 600s budget).

**Why it matters for this run:** Dropping a single 50-min episode to a one-off network hiccup is avoidable. The existing Deepgram client has a robust retry ladder; the podcast extractor inherits none of it. Expected 429 rate from F-01 makes this worse.

**Recommendation:** Add a small `fetchWithRetry` helper (3 attempts, 2s/8s backoff, 30s timeout, retry only on 429/503/network) and use it for BOTH audio download (L194) and RSS feed (L111). Mirror `deepgram.client.ts`'s `isRetryableError` logic.

**Persona votes:** Red Team, Blue Team, Reliability, Supply Chain, Insider, Database, Devil's Advocate — confirm. Performance — abstain.

---

## F-04: Key-pool exhaustion has no cooldown marker; retries burn on known-dead keys

**Severity:** HIGH · **Confidence:** HIGH · **Location:** `src/infrastructure/api/gemini.client.ts:169-231` · **Consensus:** 6/8

**Evidence:** `withModelFallback` loops over all keys × all models; on exhaustion, backs off per `BACKOFF_DELAYS_MS = [5s, 15s, 45s, 90s]`. But after backoff it re-tries EVERY key + model combination — including keys that just failed 429 in the previous iteration. There is no per-key "exhausted until X" timestamp. For Flash-Lite the free-tier quota resets per minute, so the 5s backoff is strictly pre-mature: the same key is GUARANTEED to 429 again.

**Why it matters for this run:** With a 3-key pool and default single-model chain (line 49 `['gemini-2.5-flash-lite']`), burst of 429s triggers 155s max wait where most of it is wasted on repeat failures. Expected to compound mid-batch under high concurrency.

**Recommendation:** Maintain a `keyCooldownUntil: Map<string, number>` in module scope. On 429, set `keyCooldownUntil[apiKey] = Date.now() + 65_000` (free-tier window + buffer). In `getApiKey()`, skip keys still in cooldown; if all keys are cooling, sleep until the earliest expires.

**Persona votes:** Reliability, Performance, Red Team, Database, Blue Team, Devil's Advocate — confirm. Insider, Supply Chain — abstain.

---

## F-05: Audio buffered fully in RAM — memory pressure at batch-size ≥ 5

**Severity:** MEDIUM · **Confidence:** HIGH · **Location:** `src/infrastructure/extractors/podcast.extractor.ts:202` · **Consensus:** 6/8

**Evidence:** `const audioBuffer = Buffer.from(await audioResponse.arrayBuffer())` — a 50-min MP3 at 128 kbps is ~48 MB. At concurrency 3, ~150 MB. At concurrency 10, ~500 MB. Deepgram POST body holds another copy (Uint8Array view on same buffer, so shared backing), but `fetch` internals + JSON response parsing adds overhead. Node default `--max-old-space-size` is ~4 GB on 64-bit, so crash-risk is low at ≤10, but GC pause time grows.

**Why it matters for this run:** Below critical threshold for batch-size 3. Becomes a real risk at batch-size 10 (§5.4) and a hard cap on §6 tuning past ~12. Also relevant to MAX_VIDEO_DURATION_SECONDS logic — a 90-min episode is ~86 MB in RAM.

**Recommendation:** Low-priority for this run since streaming path exists for YouTube (`deepgram.client.ts:231-246`). Long-term: pipe the podcast audio response directly into Deepgram with `duplex: 'half'` like the YouTube path does. Tag as a follow-up if §6 tuning hits a clear OOM/GC ceiling.

**Persona votes:** Performance, Reliability, Database, Red Team, Blue Team, Insider — confirm. Supply Chain, Devil's Advocate — abstain.

---

## F-06: `processedUrls` counter advances on skip due to timeout abort — may double-count when outer loop restarts

**Severity:** MEDIUM · **Confidence:** MEDIUM · **Location:** `src/domain/services/profile-scrape.service.ts:473-542` · **Consensus:** 5/8

**Evidence:** When `aborted = true` fires at L481, the limit callback `return`s early without incrementing any counters. But `remaining = discoveredUrls.slice(processedUrls)` (L424) is computed once per `processJobBatch` call from the DB-persisted `processedUrls`. If 3 of 5 remaining tasks were aborted-skipped (never started), `processedUrls` in DB stays at the pre-call value — correct. BUT: if a task completed and wrote `importedCount++` but the `progressInFlight` chain hadn't flushed yet when `writeFinalSummary` is called post-SIGINT, the DB counter lags. Subsequent restart re-runs that URL; `findPostBySourceUrl` catches the dup and increments `duplicateCount` instead. **Net effect: one post appears as both "imported" (lost from DB counter) and "duplicate" (from restart).** Summary metrics misreport, though actual DB state is correct.

**Why it matters for this run:** Muddies §8 gate evaluation ("success_rate ≥ 95"). Unlikely but non-zero.

**Recommendation:** On `processJobBatch` entry, also re-read `importedCount`/`duplicateCount`/`errorCount`/`filteredCount` from DB (already done via `getScrapeJobById` at L353 — verify the counters are used as source-of-truth, not fresh-zero). Low-risk code change if needed.

**Persona votes:** Database, Reliability, Red Team, Blue Team, Devil's Advocate — confirm. Performance, Insider, Supply Chain — abstain.

---

## F-07: Enclosure URL with signed CDN params breaks transcript cache (not dedup)

**Severity:** MEDIUM · **Confidence:** MEDIUM · **Location:** `src/infrastructure/extractors/podcast.extractor.ts:146,203-214` · **Consensus:** 5/8

**Evidence:** Transcript cache keys on `enclosureUrl` (L207 `saveTranscript({ sourceUrl: enclosureUrl, ... })`). If SoundOn signs URLs with a time-bounded token (common for podcast hosts), each run sees a different `enclosureUrl`, so `findTranscriptByUrl` misses on a re-run. **Dedup at the post level is safe** — `findPostBySourceUrl` in `import-pipeline.service.ts:372` is keyed on the stable `podcast-rss://` URL passed into `processUrl`, not the enclosure. So re-runs produce a `duplicate` not a duplicate post, but waste a full Deepgram transcription ($0.21 per 50-min ep).

**Why it matters for this run:** §5.5 (`S3-serial-rerun`, idempotency proof) expects 0 duplicates to be re-processed without cost. If enclosure URL is signed, the dedup check FIRST calls `findPostBySourceUrl(podcast-rss://...)` (stable), which correctly catches the duplicate BEFORE any extraction — so no Deepgram cost incurred on re-run. This is actually fine for the idempotency test. The cache miss only matters for fresh URLs that were partially processed and restarted mid-transcription. Downgraded severity after debate.

**Recommendation:** Verify by spot-checking one enclosure URL twice 10 minutes apart: `curl -I "$url1" ; curl -I "$url2"` and diff. If signed, switch transcript cache key to `podcast-rss://` URL (not enclosure). File as a separate tiny change if confirmed.

**Persona votes:** Database, Reliability, Insider, Blue Team — confirm. Red Team, Performance, Supply Chain, Devil's Advocate — abstain.

---

## F-08: `getApiKey()` mutates global `keyIndex` — unsafe under concurrent calls

**Severity:** MEDIUM · **Confidence:** HIGH · **Location:** `src/infrastructure/api/gemini.client.ts:99,233-240` · **Consensus:** 5/8

**Evidence:** `let keyIndex = 0;` at module scope, mutated at L238 by every call. In a single Node process this is single-threaded so no true data race, but `withModelFallback`'s outer loop at L190-192 snapshots `usedKeyIndex = (keyIndex - 1 + pool.length) % pool.length` — this is the key that `getApiKey()` just returned, BEFORE `keyIndex++` fires on the next concurrent `getApiKey()` call. Between the snapshot and the actual API call, another task could advance `keyIndex`. `usedKeyIndex` is only used for logging and `meta.keyIndex` — not for correctness — so the bug is cosmetic: a 429 log line can blame the wrong key index for another task's call.

**Why it matters for this run:** Confuses autoresearch tuning diagnostics (§6) if key-indexed 429 distribution is used as a tuning signal.

**Recommendation:** Have `getApiKey()` return `{ key, index }` as an atomic pair; thread the index through `withModelFallback` rather than re-deriving. 10-line change.

**Persona votes:** Reliability, Database, Red Team, Blue Team, Performance — confirm. Insider, Supply Chain, Devil's Advocate — abstain.

---

## F-09: Deepgram retries add up to 20s wait per episode — compounds with 600s outer budget

**Severity:** MEDIUM · **Confidence:** HIGH · **Location:** `src/infrastructure/api/deepgram.client.ts:23,195-324` · **Consensus:** 4/8

**Evidence:** `RETRY_DELAYS = [5_000, 15_000]` — up to 2 retries × (5+15)s = 20s wait plus 3× REQUEST_TIMEOUT_MS=180s in the worst case = potentially 560s total per single episode on pathological retries. `processJobBatch` timeoutMs = 600s. So ONE episode's retries can dominate an entire batch window.

**Why it matters for this run:** If Deepgram is flaky (regional issues etc.), the 600s outer budget is exhausted before other in-flight tasks finish, triggering `aborted = true` mid-batch. Log will show low progress with high wait times.

**Recommendation:** Reduce `REQUEST_TIMEOUT_MS` to 120s (2 min) for podcast path — transcription of a 50-min episode typically completes in 30–60s. Add `--retry-backoff-ms N` flag in §6.2 (already planned) so autoresearch can tune.

**Persona votes:** Reliability, Performance, Blue Team, Red Team — confirm. Database, Insider, Supply Chain, Devil's Advocate — abstain.

---

## F-10: `isLikelyInvestmentContent` pre-filter only fires for Shorts, not podcasts

**Severity:** MEDIUM · **Confidence:** HIGH · **Location:** `src/domain/services/import-pipeline.service.ts:419-426` · **Consensus:** 4/8

**Evidence:** The filter gate at L419 `if (isShort) { ... isLikelyInvestmentContent(title, description) ... }` only runs for YouTube Shorts. Podcasts skip this gate, so every Gooaye episode runs full Deepgram + Gemini even if the title suggests it's off-topic (rare for Gooaye but possible in general seed expansion).

**Why it matters for this run:** Gooaye is ~100% investment content, so the gate isn't load-bearing here. Relevant for §5.3 quality-gate pass-rate if "no_tickers_identified" appears frequently — refunds credits but wastes Deepgram minutes ($).

**Recommendation:** Not urgent for Gooaye. Add an episode-title pre-filter for podcast path in a separate change when seeding a KOL whose content is mixed topic.

**Persona votes:** Reliability, Performance, Blue Team, Insider — confirm. Red Team, Database, Supply Chain, Devil's Advocate — abstain.

---

## F-11: Single `fetch(feedUrl)` at script L200 has no timeout — can hang forever

**Severity:** LOW · **Confidence:** HIGH · **Location:** `scripts/scrape-guyi-podcast-ep501-600.ts:200-203` · **Consensus:** 3/8 (Minority)

**Evidence:** The script's own RSS fetch lacks an AbortController. If SoundOn hangs the TCP connection pre-response, the script hangs indefinitely before even creating the scrape job. No logs, no progress, SIGINT required to unblock.

**Why it matters for this run:** Low (SoundOn is reliable). Noted as a minority observation.

**Recommendation:** Wrap with 30s AbortController. 4-line change. Likely best batched with F-03's retry helper into a `scripts/lib/fetch-utils.ts`.

**Persona votes:** Reliability, Blue Team, Devil's Advocate — confirm. Others abstain.

---

## F-12: Gemini cooldown queue grows unbounded — theoretical memory leak

**Severity:** LOW · **Confidence:** MEDIUM · **Location:** `src/infrastructure/api/gemini.client.ts:127-135` · **Consensus:** 2/8 (Minority)

**Evidence:** `cooldownQueue = cooldownQueue.then(...)` creates an ever-lengthening promise chain. V8 handles this via `.then` microtask links, but the chain is held for the life of the process. For a 100-ep run with ~8 Gemini calls × 100 = 800 chained promises, this is small. But for a long-running worker (e.g., the cron monitoring path in `profile-scrape.service.ts:594`), it's a potential slow leak.

**Why it matters for this run:** Not for §5/§8. Worth filing for the cron path.

**Recommendation:** Use a single promise + timestamp-compare pattern instead of chain. Defer unless §8 shows memory growth.

**Persona votes:** Performance, Devil's Advocate — confirm. Others abstain.

---

## F-13: `onStage` callback's `try/catch` swallows errors silently

**Severity:** LOW · **Confidence:** HIGH · **Location:** `src/domain/services/import-pipeline.service.ts:334-339` · **Consensus:** 3/8

**Evidence:** `emit` wraps the callback in try/catch and logs a warning. If the scrape_job_items stage write (via `scheduleItemWrite`) fails repeatedly (e.g., DB connection broken), the per-URL progress UI silently stops updating but batch processing continues. Misleading to an operator watching the UI.

**Why it matters for this run:** Seed script doesn't watch the UI, so no operator impact here. Could matter for §7.2 deliberate failure probes.

**Recommendation:** Throttle the warn logs (1 per minute) and emit a single `[pipeline] item-write errors suppressed: N` line at batch end. Defer unless §7 surfaces it.

**Persona votes:** Blue Team, Reliability, Devil's Advocate — confirm. Others abstain.

---

## F-14: `extractArguments` errors logged but not counted — hides Gemini flakiness

**Severity:** MEDIUM · **Confidence:** HIGH · **Location:** `src/domain/services/import-pipeline.service.ts:725-754` · **Consensus:** 5/8

**Evidence:** Line 725 uses `Promise.allSettled`; rejected results log at L742 but do NOT increment `stageMeta.argumentsRetries` and do NOT cause the URL to fail. The post is still created with whatever arguments DID succeed (possibly zero). `argumentsOk = results.some(r => r.status === 'fulfilled')` — a single partial success flips it to true even if N-1 stocks had no arguments extracted. This hides quality-gate failures where a post is created with ZERO arguments for several tickers.

**Why it matters for this run:** Directly affects §5.3 quality gate. A "success" in success_rate could be a post with no arguments on 4/5 tickers — visually empty on the UI.

**Recommendation:** Count per-ticker failures in a separate stage-meta field (`argumentsPartialFailures`). Consider adding quality-gate metric: `avg(arguments_extracted_per_stock) ≥ 1` in `summarize-run.ts`.

**Persona votes:** Reliability, Database, Blue Team, Red Team, Insider — confirm. Others abstain.

---

## F-15: Model fallback chain defaults to a single model — 503 on Flash-Lite = full backoff every time

**Severity:** MEDIUM · **Confidence:** HIGH · **Location:** `src/infrastructure/api/gemini.client.ts:49,174` · **Consensus:** 4/8

**Evidence:** `DEFAULT_MODEL_CHAIN: ['gemini-2.5-flash-lite']` — a single model. `withModelFallback` loops `for (model of chain)` so chain length 1 means the "fallback" is immediate re-key, not a different model. If Flash-Lite is down globally, all keys × all models = all 3 keys × 1 model fail, triggering 155s total backoff, then repeat. No actual fallback model.

**Why it matters for this run:** Low frequency but high blast radius. If Flash-Lite has a regional outage during the 100-ep run, wall time balloons by up to 10+ minutes of pure backoff.

**Recommendation:** Set `AI_MODEL_CHAIN=gemini-2.5-flash-lite,gemini-2.0-flash-exp` (or similar fallback) in `.env.local` before §8. Document in baseline.md as a guardrail.

**Persona votes:** Reliability, Red Team, Performance, Blue Team — confirm. Others abstain.

---

## Persona voting matrix summary

| Persona | Confirmed | Disputed | Abstained |
|---|---|---|---|
| Red Team Attacker | 10 | 0 | 5 |
| Blue Team Defender | 12 | 0 | 3 |
| Insider Threat | 7 | 0 | 8 |
| Supply Chain Analyst | 4 | 0 | 11 |
| Reliability Engineer | 13 | 0 | 2 |
| Performance Engineer | 9 | 0 | 6 |
| Database Analyst | 9 | 0 | 6 |
| Devil's Advocate | 8 | 0 | 7 |

No disputes — all findings held against adversarial challenge. Devil's Advocate invoked "concede with conditions" on F-01 (claimed feed TTL should be tunable, not fixed at 10min) and F-05 (claimed GC pause is hypothetical without profiling data).
