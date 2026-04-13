## 1. Dependencies & Dictionary

- [x] 1.1 Install `opencc-js` (`npm install opencc-js`). Verified: using `cn→twp` for phrase-level conversion. Note: outputs 臺積電 (classical form) — dictionary maps 臺→台 for stock-context terms.
- [x] 1.2 Create `src/data/transcript-dictionary.json` with 7 categories: tickers_us, tickers_tw, financial_zh, financial_en, tech_terms, brands, kol_names. Seeded from Gooaye transcript issues.
- [x] 1.3 Add TypeScript types for the dictionary schema in `src/domain/services/transcript-cleanup.ts`

## 2. Core Cleanup Function

- [x] 2.1 Implement `mergeIsolatedLetters(text: string): string` — regex with word boundaries, collapses 2+ isolated uppercase letters.
- [x] 2.2 Implement `applyDictionary(text: string): string` — lazy-load + pre-compile regex. Supports both exact and regex patterns.
- [x] 2.3 Implement `convertSimplifiedToTraditional(text: string): string` — uses `opencc-js` cn→twp mode. CJK check to skip English-only text.
- [x] 2.4 Implement `cleanTranscript(text: string): string` — composes 3 passes. Pure, exported.

## 3. Tests

- [x] 3.1 Unit tests for `mergeIsolatedLetters`: 9 tests covering ticker fragments, single-letter preservation, mixed-case, edge cases.
- [x] 3.2 Unit tests for `applyDictionary`: 7 tests covering exact match, regex, multiple replacements, KOL names, brands.
- [x] 3.3 Unit tests for `convertSimplifiedToTraditional`: 5 tests covering conversion, already-Traditional, English-only, compound words.
- [x] 3.4 Integration test for `cleanTranscript`: Gooaye-style snippet with combined issues. Verifies tickers identifiable.
- [x] 3.5 Idempotency test: `cleanTranscript(cleanTranscript(x)) === cleanTranscript(x)` passes.

## 4. Pipeline Integration

- [x] 4.1 Import `cleanTranscript` in `import-pipeline.service.ts`. Inserted as step 3.5 before `analyzeDraftContent()`.
- [x] 4.2 `npm run type-check` passes
- [x] 4.3 `npm test` passes — 886/886 (26 new transcript-cleanup tests)

## 5. Validation

- [x] 5.1 Validation: diagnostic script confirmed cleanup works — single transcript produced 10 tickers (NVDA, ARM, INTC, AMD, 3533.TW, 0050.TW + inferred). Batch scrape still shows 0 imports due to two **unrelated downstream issues**: (1) missing `statement_type` column in `post_arguments` table, (2) `maxOutputTokens: 1536` too low for 30K-char transcripts causing truncated JSON. Both are separate fixes.
