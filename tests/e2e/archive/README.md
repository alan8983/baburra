# Archived E2E Tests

These tests were archived because they depend on live external APIs (Gemini AI, Twitter oEmbed) that make them unreliable in CI:

## Why they fail

1. **Gemini API dependency**: The quick-input route calls `analyzeDraftContent()` + `extractArguments()` per ticker. Each Gemini call takes 15-30s with a 30s timeout. A single test can require 60-90s of AI processing alone, exceeding the Playwright test timeout.

2. **Twitter oEmbed dependency**: URL-based fixtures (e.g. `Pltr_Unclestocknotes_20260217.txt`) fetch content from `publish.twitter.com/oembed`, which is rate-limited and unreliable in CI environments.

3. **Sequential execution**: With `workers: 1` in CI and 11 fixture files, each needing 2+ Gemini calls, total runtime can exceed 30 minutes even when APIs respond.

## Archived files

- `quick-input.spec.ts.bak` — Data-driven test that loaded `.txt` fixtures and verified AI analysis results
- `core-flow.spec.ts.bak` — Full happy-path test (input -> draft -> edit -> publish) that depended on AI completing within timeout
- `fixtures-quick-input/` — The 11 fixture files with real KOL posts

## How to restore

If you want to run these tests locally (with valid `GEMINI_API_KEY`):

```bash
cp tests/e2e/archive/quick-input.spec.ts.bak tests/e2e/quick-input.spec.ts
cp tests/e2e/archive/core-flow.spec.ts.bak tests/e2e/core-flow.spec.ts
npx playwright test --timeout 180000
```

## Better approach

The replacement tests in `quick-input.spec.ts` and `core-flow.spec.ts` verify UI behavior without depending on external APIs. AI analysis quality should be tested via unit tests against `analyzeDraftContent()` with mocked Gemini responses.
