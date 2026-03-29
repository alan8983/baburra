## MODIFIED Requirements

### Requirement: Ticker identification output schema
The AI pipeline ticker identification SHALL return an extended `IdentifiedTicker` object that includes source tracking fields:

```ts
{
  ticker: string,
  name: string,
  market: Market,
  confidence: number,
  mentionedAs: string,
  source: 'explicit' | 'inferred',
  inferenceReason?: string
}
```

The `source` field SHALL be `'explicit'` when the KOL directly mentions the ticker and `'inferred'` when the AI maps macro content to a tradeable instrument. The `inferenceReason` field SHALL only be present when `source` is `'inferred'`.

#### Scenario: Explicit ticker returns source field
- **WHEN** the AI identifies a directly mentioned ticker like "台積電(2330)"
- **THEN** the returned `IdentifiedTicker` includes `source: 'explicit'` and no `inferenceReason`

#### Scenario: Inferred ticker returns source and reason
- **WHEN** the AI infers an instrument from macro content about Fed rate policy
- **THEN** the returned `IdentifiedTicker` includes `source: 'inferred'` and `inferenceReason` explaining the mapping

#### Scenario: Mixed post returns both explicit and inferred tickers
- **WHEN** a post mentions "台積電" explicitly AND discusses "Fed降息對半導體產業的影響"
- **THEN** the AI returns 台積電 with `source: 'explicit'` AND may return SMH with `source: 'inferred'`

### Requirement: Draft analysis prompt includes macro inference
The `buildDraftAnalysisPrompt` function SHALL include macro-to-instrument inference rules as part of the ticker identification instructions. The prompt SHALL instruct Gemini to:
1. First identify all explicitly mentioned tickers (existing behavior)
2. Then analyze remaining macro content for inferable instruments
3. Prefer high-liquidity ETFs as inferred proxies
4. Select the MOST directly affected instrument when multiple apply
5. Return no inference if the macro topic has no clear tradeable proxy

#### Scenario: Prompt handles post with only macro content
- **WHEN** a post contains only macro discussion (no explicit tickers)
- **THEN** the AI prompt enables Gemini to identify inferred instruments and returns them with `source: 'inferred'`

#### Scenario: Prompt preserves existing explicit ticker behavior
- **WHEN** a post contains explicit stock mentions
- **THEN** the AI identifies them exactly as before, with `source: 'explicit'` added
