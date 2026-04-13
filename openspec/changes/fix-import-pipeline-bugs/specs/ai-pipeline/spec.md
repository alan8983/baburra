## MODIFIED Requirements

### Requirement: Draft analysis generation mode

The draft analysis function (`analyzeDraftContent`) SHALL use `generateStructuredJson()` with a response schema instead of `generateJson()` for JSON output generation. The `maxOutputTokens` SHALL be set to 4096.

#### Scenario: Long transcript analysis succeeds
- **WHEN** `analyzeDraftContent()` is called with a transcript of 30,000+ characters containing 5-10 stock tickers
- **THEN** the function returns a valid `RawDraftAnalysis` object with all tickers, sentiments, and reasoning without JSON parse errors

#### Scenario: Response schema enforcement
- **WHEN** Gemini generates the draft analysis response
- **THEN** the output conforms to the `RawDraftAnalysis` schema (kolName, tickers array, sentiment, stockSentiments, confidence, reasoning, postedAt) and is valid JSON

#### Scenario: Short transcript analysis unchanged
- **WHEN** `analyzeDraftContent()` is called with a short transcript (<5000 characters, 1-2 tickers)
- **THEN** the function returns a valid result identical in structure to the previous implementation
