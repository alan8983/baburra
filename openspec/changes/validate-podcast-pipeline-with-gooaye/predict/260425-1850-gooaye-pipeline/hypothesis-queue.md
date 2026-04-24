# Hypothesis Queue — Gooaye Pipeline Predict

Ranked for §5 (stress runs) and §6 (autoresearch tuning) consumption.

| Rank | ID | Hypothesis | Confidence | Location | Source |
|---|---|---|---|---|---|
| 1 | H-01 | At batch-size ≥3, 100-ep run issues 300+ identical RSS feed fetches to SoundOn in seconds — triggers host rate-limit or socket resets | HIGH | `podcast.extractor.ts:111` | F-01 (8/8) |
| 2 | H-02 | Global `cooldownQueue` mutex in `gemini.client.ts` caps effective Gemini throughput — `--batch-size` tuning above 3 shows diminishing returns regardless of key-pool size | HIGH | `gemini.client.ts:115-135` | F-02 (7/8) |
| 3 | H-03 | Single transient 429/503 on audio enclosure URL permanently fails that episode — no retry in `podcast.extractor.ts:194` | HIGH | `podcast.extractor.ts:194-200` | F-03 (7/8) |
| 4 | H-04 | After a 429 backoff cycle, retrying the same quota-exhausted Gemini key within 60s produces predictable 429s and wastes retry budget | HIGH | `gemini.client.ts:169-231` | F-04 (6/8) |
| 5 | H-05 | At batch-size 10, peak RSS audio buffer memory exceeds 500 MB — measurable GC pause or `allocation failed` in Node | MEDIUM | `podcast.extractor.ts:202` | F-05 (6/8) |
| 6 | H-06 | Re-run of an interrupted batch may over-count duplicates under the covers if SIGINT fires mid-progress-flush | MEDIUM | `profile-scrape.service.ts:473-542` | F-06 (5/8) |
| 7 | H-07 | SoundOn enclosure URLs are signed/time-bounded — same episode on run1 vs run2 has different `enclosure_url`, breaking transcript cache (not dedup) | MEDIUM | `podcast.extractor.ts:146,203-214` | F-07 (5/8) |
| 8 | H-08 | `meta.keyIndex` in observability log entries can attribute a 429 to the wrong key under concurrent calls | LOW | `gemini.client.ts:99,233-240` | F-08 (5/8) |
| 9 | H-09 | Deepgram retry ladder (5s + 15s + 180s timeout) can consume the full 600s outer budget on a single misbehaving episode | MEDIUM | `deepgram.client.ts:23,195-324` | F-09 (4/8) |
| 10 | H-10 | `extractArguments` per-ticker failures are silently swallowed; posts are created with zero arguments for some tickers | MEDIUM | `import-pipeline.service.ts:725-754` | F-14 (5/8) |
| 11 | H-11 | Default `AI_MODEL_CHAIN` of a single model means a Flash-Lite outage == no fallback, burns full 155s backoff cycle repeatedly | MEDIUM | `gemini.client.ts:49,174` | F-15 (4/8) |

## Chain targets

- **§5 (stress runs) should test:** H-01 (watch for 429/socket errors on RSS fetch), H-03 (watch for one-shot failures on audio URL), H-05 (watch RSS + Node heap usage at concurrency 10), H-07 (spot-check enclosure URL stability).
- **§6 (tuning) should tune:** H-02 (measure success_rate with `GEMINI_COOLDOWN_MS=0`), H-09 (measure with `REQUEST_TIMEOUT_MS=120000`), H-04 (add per-key cooldown marker, measure 429 distribution).
- **§7 (failure probes) can inject:** mock SoundOn 429 mid-RSS-fetch (H-01, H-03), corrupt enclosure URL (H-07).

## Pre-run quick-win candidates (before S3 at §5.4)

H-01 is a 1-line fix (TTL cache on parsed RSS) that eliminates the most common predicted failure mode. Worth doing before burning $15-20 on a 10-ep stress run.
