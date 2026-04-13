## Why

The Gooaye EP 601-650 batch scrape (43 videos) achieved 100% audio download + Deepgram transcription success thanks to the yt-dlp fallback, but **0% import** because every Gemini AI analysis call failed with 429/RESOURCE_EXHAUSTED. The current client has no backoff — when all 3 models in the fallback chain are quota-exhausted simultaneously, requests fail instantly. With 3 concurrent video pipelines each triggering multiple Gemini calls (analysis + per-ticker extraction), the free-tier quota is overwhelmed within minutes.

## What Changes

- **Multi-key round-robin**: Support `GEMINI_API_KEYS` env var (comma-separated) to distribute requests across N API keys, multiplying available quota. Falls back to existing single `GEMINI_API_KEY` for backwards-compatibility.
- **Exponential backoff on full-chain exhaustion**: After all models × all keys are quota-blocked, wait with geometric backoff (2s → 6s → 18s) before retrying the entire chain, instead of failing immediately.
- **Updated env config**: Add `GEMINI_API_KEYS` to `.env.example` with documentation.

## Capabilities

### New Capabilities

- `gemini-resilience`: API key pooling and exponential backoff for Gemini quota errors

### Modified Capabilities

- `ai-pipeline`: Gemini client retry semantics change (backoff added, multi-key support)

## Impact

- **Code**: `src/infrastructure/api/gemini.client.ts` — core changes to `withModelFallback`, `getApiKey`, new key pool init
- **Config**: `.env.example` — new `GEMINI_API_KEYS` variable
- **Dependencies**: None (pure logic change)
- **Backwards-compatible**: Single `GEMINI_API_KEY` continues to work unchanged; backoff only activates on quota errors
