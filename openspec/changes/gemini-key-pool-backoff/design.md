## Context

The Gemini client (`src/infrastructure/api/gemini.client.ts`) currently uses a model fallback chain (3 models) with a single API key. On 429/RESOURCE_EXHAUSTED errors it instantly tries the next model — no delay, no key rotation. When all models are exhausted (common during batch scrapes), the request fails immediately.

The Deepgram client already has proper exponential backoff (5s → 15s). Gemini has none.

## Goals / Non-Goals

**Goals:**
- Support multiple Gemini API keys via `GEMINI_API_KEYS` env var, round-robined per request
- Add exponential backoff when the full model × key matrix is exhausted
- Maintain 100% backwards-compatibility with single `GEMINI_API_KEY`
- Zero changes to public API surface (`generateContent`, `generateStructuredJson`, `generateJson`)

**Non-Goals:**
- Global rate limiter / token bucket (future work, not needed for this fix)
- Per-key quota tracking or smart routing (round-robin is sufficient)
- Changes to Deepgram client or transcription pipeline
- Changes to concurrency model in profile-scrape service

## Decisions

### 1. Key pool with round-robin (not random, not least-recently-used)

Round-robin via atomic counter ensures even distribution. Random could cluster on one key; LRU adds complexity for negligible benefit at small pool sizes (2-5 keys).

### 2. Retry loop: key → model → backoff (model-first fallback)

The `withModelFallback` function becomes a 3-level loop:
```
for attempt in [0..BACKOFF_RETRIES]:
  if attempt > 0: sleep(backoff[attempt-1])
  for key in pool:
    for model in chain:
      try fn(model, key)
      catch quota → continue
      catch other → throw
throw lastErr
```

**Critical: model is the inner loop, key is the outer.** This ensures model fallback (e.g. Gemma → Flash Lite) fires before rotating keys on the same quota-limited model. Gemma 4 models have a 16K TPM limit; a single 50-min transcript (~25-50K tokens) exceeds that in one call. Flash Lite has 4M TPM. If keys were inner, all 3 keys would burn against the same Gemma TPM pool before ever reaching Flash Lite.

### 3. Backoff delays: 5s → 15s → 45s → 90s (total ~155s)

- Long enough to span at least one full per-minute quota reset window
- Google API returns `Please retry in ~6s` for TPM violations, so 5s first backoff aligns with that
- Not so long that single-request latency becomes unacceptable

### 4. Serialized per-call cooldown (promise-chain mutex)

A 1.5s minimum gap between consecutive Gemini API calls, enforced via a promise-chain mutex. Concurrent pipelines (e.g. 3 parallel YouTube scrapes) queue their Gemini calls instead of racing. Without serialization, `lastCallTime` checks race — multiple async callers read the same timestamp and all pass through simultaneously. Default 1500ms, configurable via `GEMINI_COOLDOWN_MS`.

### 5. `fn` signature changes to `(model, apiKey)` instead of `(model)`

Internal functions (`generateContentWithModel`, `generateStructuredJsonWithModel`) receive the API key as a parameter instead of calling `getApiKey()` themselves. This ensures the round-robin key selected by `withModelFallback` is the one actually used.

### 6. `geminiTranscribeShort` uses `getApiKey()` directly (no change)

This function uses a hardcoded model (`gemini-2.5-flash-lite`) and doesn't go through `withModelFallback`. It still benefits from key rotation via the shared round-robin counter.

## Risks / Trade-offs

- **[Stale key]** A revoked/invalid key in the pool will cause one wasted attempt per rotation → Mitigation: Non-quota errors (401/403) propagate immediately, so a bad key only costs one failed call, not a full backoff cycle.
- **[Counter not thread-safe across workers]** `keyIndex` is module-scoped; in serverless (Vercel), each cold start resets it → Acceptable: round-robin doesn't need global state; even if two workers pick the same key, it still distributes better than a single key.
- **[Max latency increase]** Worst case adds ~155s to a request that would have failed instantly → Acceptable trade-off: failing fast was causing 100% failure; waiting with a chance of success is strictly better.
- **[Gemma TPM bottleneck]** Gemma 4 models have only 16K TPM (even on paid tier). Long transcripts (25-50K tokens) always 429 on Gemma and fall through to Flash Lite. The Gemma attempt adds ~1.5s overhead per call. This is acceptable: Gemma still handles short prompts (ticker ID, reanalysis) cheaply, and Flash Lite at 4M TPM absorbs the heavy transcript work.
- **[Same-project keys share quota]** Multiple API keys on the same Google Cloud project share TPM/RPM limits. Key rotation only helps when keys are on different projects with separate quota pools. With same-project keys, model fallback (not key rotation) is what actually resolves TPM exhaustion.
