## 1. Catalogue and loader

- [ ] 1.1 Create `src/domain/services/keywords/zh-tw-financial.txt` with an initial curated list (~200 terms). Include a header comment with review cadence and contribution rules.
- [ ] 1.2 Create `src/domain/services/transcription-keywords.ts` that loads the txt file at module init, exports `getStaticKeywords(): KeywordEntry[]`.
- [ ] 1.3 Add `getTickerKeywords()` that reads active tickers from the `stocks` repository, caches in-memory.
- [ ] 1.4 Add `getKolKeywords(kolId: string)` that reads display name + aliases from the `kols` repository.
- [ ] 1.5 Add `composeKeywordList({ kolId? }): KeywordEntry[]` returning the merged list with weights applied (default 2.0; tickers 3.0).

## 2. Deepgram client wiring

- [ ] 2.1 Update the Deepgram client wrapper (under `src/infrastructure/api/` or wherever the lego change places it) to accept an optional `keywords: KeywordEntry[]` parameter and serialize each as `keyword:weight` in the query string.
- [ ] 2.2 Update `transcribeAudio` (the routing service from `rework-credit-cost-lego`) to call `composeKeywordList({ kolId })` and pass the result to the Deepgram client when `DEEPGRAM_KEYWORD_BOOST_ENABLED === 'true'`.
- [ ] 2.3 Ensure the Gemini-audio failover path is unaffected (no keyword param sent there).

## 3. Feature flag and ops

- [ ] 3.1 Add `DEEPGRAM_KEYWORD_BOOST_ENABLED` to `.env.example` with a comment.
- [ ] 3.2 Document the Deepgram plan upgrade requirement in `docs/INFRA.md` (or create the file if missing). Include the cost delta and the keyword-list cap (Deepgram's 200-keyword limit per request).
- [ ] 3.3 Operational task (NOT code): move Deepgram account to Growth plan. Block the rollout step on this.

## 4. Telemetry

- [ ] 4.1 Log the per-request keyword list size at debug level. Tag with `kolId` for slicing.
- [ ] 4.2 Optional: a one-shot script to spot-check transcription quality on 5–10 fixture clips before/after enabling the flag.

## 5. Tests

- [ ] 5.1 Unit tests for the txt loader (parses, ignores `#` comments, dedupes).
- [ ] 5.2 Unit tests for `composeKeywordList` (with/without kolId, weight application, cap enforcement).
- [ ] 5.3 Unit test for the Deepgram client serialization (entries become `keyword:weight` query params).
- [ ] 5.4 Integration test stub: transcribeAudio called with kolId injects KOL name into the request payload.

## 6. Spec + rollout

- [ ] 6.1 Write `specs/transcription-accuracy/spec.md` with the requirements added in this change.
- [ ] 6.2 Wait for `rework-credit-cost-lego` to merge.
- [ ] 6.3 Wait for the Deepgram plan upgrade.
- [ ] 6.4 Enable `DEEPGRAM_KEYWORD_BOOST_ENABLED=true` in production.
- [ ] 6.5 Spot-check 5 transcripts to confirm accuracy improved (or at minimum did not regress).
- [ ] 6.6 Archive with `/opsx:archive deepgram-keyword-boost`.
