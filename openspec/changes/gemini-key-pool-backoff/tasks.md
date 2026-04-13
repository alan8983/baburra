## 1. Key Pool

- [x] 1.1 Add `buildKeyPool()` function that reads `GEMINI_API_KEYS` (comma-separated), falls back to `GEMINI_API_KEY`, returns `string[]`. Init module-scoped `KEY_POOL` and `keyIndex` counter.
- [x] 1.2 Rewrite `getApiKey()` to round-robin from `KEY_POOL` via `keyIndex++`. Throw if pool is empty.
- [x] 1.3 Add `GEMINI_API_KEYS` and `GEMINI_COOLDOWN_MS` to `.env.example` with documentation comments.

## 2. Backoff, Retry & Cooldown

- [x] 2.1 Add `sleep(ms)` helper and `BACKOFF_DELAYS_MS = [5_000, 15_000, 45_000, 90_000]` constant (~155s total).
- [x] 2.2 Rewrite `withModelFallback` to accept `fn: (model, apiKey) => Promise<T>`. Implement 3-level loop: `attempt → key → model` (model-first fallback so Gemma→Flash Lite fires before burning keys on the same TPM-limited model).
- [x] 2.3 Update `generateContentWithModel` and `generateStructuredJsonWithModel` signatures to accept `apiKey` parameter instead of calling `getApiKey()` internally.
- [x] 2.4 Update `generateContent` and `generateStructuredJson` call sites to pass `(m, key) =>` to `withModelFallback`.
- [x] 2.5 Add serialized per-call cooldown via promise-chain mutex (1.5s default, `GEMINI_COOLDOWN_MS` override). Prevents concurrent pipelines from bursting through per-minute quota.

## 3. Verification

- [x] 3.1 `npm run type-check` passes
- [x] 3.2 `npm test` passes (all existing tests — 860/860)
- [x] 3.3 Re-run `npx tsx scripts/scrape-gooaye-yt-601-650.ts` — validated: 0 rate limit errors, all 43 videos processed via Flash Lite. "Errors" are content-level (no tickers/not investment), not API failures.
- [x] 3.4 Fix lazy initialisation of KEY_POOL and EFFECTIVE_CHAIN — ES import hoisting caused module-level `buildKeyPool()` to run before scripts' env-loading loop, resulting in empty key pool.

## Learnings (from validation runs)

- **Gemma 4 TPM limit is 16K** (even on paid tier). A single 50-min transcript is 25-50K tokens → always 429s on Gemma. Flash Lite has 4M TPM.
- **Same-project API keys share TPM/RPM pools.** Multi-key rotation only helps with keys on different Google Cloud projects.
- **Loop order matters**: model-inner ensures Gemma→Flash Lite fallback fires immediately instead of burning 3 keys against the same Gemma TPM ceiling.
- **Cooldown must be mutex-serialized**: a simple `lastCallTime` check races under concurrent async pipelines. Promise-chain mutex ensures true serialization.
