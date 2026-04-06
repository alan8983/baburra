## ADDED Requirements

### Requirement: Macro-to-instrument inference in ticker identification
The AI pipeline SHALL support two modes of ticker identification: **explicit** (KOL directly mentions a stock/crypto by name or ticker) and **inferred** (AI maps macro topics to the most directly affected tradeable instrument). Each identified ticker SHALL include a `source` field (`'explicit'` or `'inferred'`).

#### Scenario: Explicit ticker identification (existing behavior preserved)
- **WHEN** a post contains "我看好台積電(2330)今年的營收成長"
- **THEN** the AI identifies `{ ticker: "2330.TW", name: "台積電", market: "TW", source: "explicit" }`

#### Scenario: Macro topic infers broad market instrument
- **WHEN** a post discusses "美國最新CPI數據顯示通膨降溫，有利於股市表現"
- **THEN** the AI identifies `{ ticker: "SPY", name: "S&P 500 ETF", market: "US", source: "inferred", inferenceReason: "美國CPI數據直接影響整體股市走勢" }`

#### Scenario: Rate policy infers bond instrument
- **WHEN** a post discusses "聯準會鮑爾暗示明年可能降息，長天期公債將受惠"
- **THEN** the AI identifies `{ ticker: "TLT", name: "20+ Year Treasury Bond ETF", market: "US", source: "inferred", inferenceReason: "Fed降息直接影響長天期公債價格" }`

#### Scenario: Taiwan macro infers local index ETF
- **WHEN** a post discusses "台灣景氣燈號轉為綠燈，PMI也回到擴張區間"
- **THEN** the AI identifies `{ ticker: "0050.TW", name: "元大台灣50", market: "TW", source: "inferred", inferenceReason: "台灣景氣指標直接反映在大盤指數表現" }`

#### Scenario: Sector topic infers sector ETF
- **WHEN** a post discusses "半導體產業受AI需求驅動，晶片供不應求"
- **THEN** the AI identifies `{ ticker: "SMH", name: "VanEck Semiconductor ETF", market: "US", source: "inferred", inferenceReason: "半導體產業趨勢最直接反映在半導體類股ETF" }`

#### Scenario: No forced inference for unclear topics
- **WHEN** a post discusses general market commentary without a clear macro theme (e.g., "投資要有紀律，不要追高殺低")
- **THEN** the AI returns no tickers rather than forcing an inference

### Requirement: Inference reason tracking
Every inferred ticker SHALL include an `inferenceReason` string explaining why the instrument was chosen as a proxy for the macro topic. This reason SHALL be in the same language as the source content (typically Traditional Chinese).

#### Scenario: Inference reason is human-readable
- **WHEN** the AI infers TLT from a Fed rate discussion
- **THEN** `inferenceReason` contains a concise explanation like "Fed升息直接影響長天期公債價格" (not a generic template)

#### Scenario: Explicit tickers have no inference reason
- **WHEN** the AI identifies an explicitly mentioned ticker
- **THEN** `inferenceReason` is undefined/null

### Requirement: High-liquidity ETF preference
The AI prompt SHALL instruct the model to prefer well-known, high-liquidity ETFs as inferred instruments. When multiple instruments could apply, the model SHALL select the MOST directly affected instrument.

#### Scenario: Rate discussion picks bonds over equities
- **WHEN** a post discusses Fed rate cuts broadly (not specific to growth outlook)
- **THEN** the AI infers TLT (bond ETF directly affected by rates) rather than SPY (indirectly affected)

#### Scenario: Growth discussion picks equities over bonds
- **WHEN** a post discusses US economic growth momentum and employment strength
- **THEN** the AI infers SPY (equity market proxy for growth) rather than TLT

### Requirement: Inferred ticker UI indicator
The UI SHALL visually distinguish inferred tickers from explicit tickers on post detail and argument cards.

#### Scenario: Inferred ticker shows badge
- **WHEN** a post displays a ticker with `source: 'inferred'`
- **THEN** a "推論" badge or tooltip is shown indicating "此標的為系統根據宏觀分析推論，非 KOL 直接提及"

#### Scenario: Explicit ticker shows no badge
- **WHEN** a post displays a ticker with `source: 'explicit'`
- **THEN** no special indicator is shown (default display)

### Requirement: Win rate footnote for inferred tickers
When a win rate calculation includes results from inferred tickers, the UI SHALL display a footnote: "此勝率包含系統推論的關聯標的".

#### Scenario: Win rate with mixed sources shows footnote
- **WHEN** a KOL's win rate includes posts with at least one inferred ticker
- **THEN** the win rate display includes the footnote "此勝率包含系統推論的關聯標的"

#### Scenario: Win rate with only explicit tickers shows no footnote
- **WHEN** a KOL's win rate includes only posts with explicit tickers
- **THEN** no footnote is displayed
