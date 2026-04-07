# Baburra Tier Design

## Pricing Philosophy

> Make the cost of subscribing < the cost of replicating (building your own scraper + AI pipeline).
> Gate on **usage depth**, not on **data visibility**. The shared data pool is the hook — don't hide it.

---

## Data Visibility Layers

### Layer 1 — Aggregated Intelligence (Open to All)

- KOL existence, profile metadata, platform coverage
- Total posts analyzed per KOL
- Tickers covered by each KOL
- Overall sentiment ratio (bullish/bearish) & accuracy score
- Per-post structured summary: date, platform, ticker, sentiment direction, one-line argument summary, confidence, statement type

### Layer 2 — KOL Deep Dive (KOL Page)

Single KOL's historical views on a specific ticker over time. Answers: *"How has this KOL's stance on TSMC evolved?"*

- Full argument chain per post (original text / transcript excerpt, detailed reasoning)
- Backtest detail: entry price at time of call, subsequent price movement, hit/miss classification
- Timeline visualization of stance changes

### Layer 3 — Market Insight (Stock Page)

Multiple KOLs' views on the same ticker, cross-referenced. Answers: *"What does the market of KOLs think about TSMC right now?"*

- Cross-KOL argument comparison matrix
- Consensus vs. contrarian signal
- Temporal sentiment trend across all KOLs
- Strongest bull/bear arguments aggregated

> Layer 3 requires database depth to be valuable. Target: 6 months of seed data before promoting this feature.

---

## Tier Matrix

| | **Free** | **Pro ($9.99/mo)** | **Max ($24.99/mo)** |
|---|---|---|---|
| **Layer 1 access** | ✅ Full | ✅ Full | ✅ Full |
| **Layer 2 access** | Credit-gated (1 credit per KOL×ticker unlock) or limited free quota (e.g. 3 tickers) | ✅ Full — all KOL×ticker combinations | ✅ Full |
| **Layer 3 access** | Credit-gated (5 credits per Stock page) | Credit-gated (5 credits per Stock page) | ✅ Full — all Stock pages |
| **Monthly credits** | 5 | 50 | Unlimited |
| **KOL scrape cost** | 3 credits | 3 credits | 3 credits (unlimited budget) |
| **Layer 2 unlock cost** | 1 credit | Included | Included |
| **Layer 3 unlock cost** | 5 credits | 5 credits | Included |
| **Cross-KOL comparison** | ❌ | ❌ | ✅ |
| **API access** | ❌ | ❌ | ✅ |
| **Export / download** | ❌ | Partial (CSV) | ✅ Full |
| **Priority scrape queue** | ❌ | ❌ | ✅ |

---

## Credit System

| Action | Credit Cost | Notes |
|---|---|---|
| Scrape a new KOL profile | 3 | Covers AI extraction + scraping cost with margin |
| Unlock Layer 2 (KOL × ticker) | 1 | Persistent unlock, not per-session |
| Unlock Layer 3 (Stock page) | 5 | Persistent unlock for that ticker |
| À la carte credit pack | $0.50/credit | For Free/Pro users needing more |

**Free tier: 5 credits/month** — enough for ~1 KOL scrape + 2 content unlocks, or 5 Layer 2 unlocks. Designed to let users experience value before converting.

---

## Pro vs Max — Core Differentiation

| Dimension | Pro | Max |
|---|---|---|
| Primary value | Full KOL-level depth (Layer 2) | Full market-level insight (Layer 3) + API |
| Target user | Individual investor tracking favorite KOLs | Power user / developer / data-driven investor |
| Layer 3 | Pay-per-unlock via credits | Unlimited |
| API access | ❌ | ✅ (for AI agents, integrations) |
| Cross-KOL comparison | ❌ | ✅ |

---

## Seed Scraping & Data Strategy

The platform runs its own **seed scraping pipeline** independent of user actions:

- ~30 seed KOLs (growing to 60 over 12 months) scraped bi-weekly
- Covers YouTube, Twitter/X, Podcast RSS
- Platform absorbs the cost (~$38–70/month total including infra)
- Purpose: build Layer 3 data depth so the Stock Page has value on day one for early adopters

**User credits are for personalization**, not for feeding the core database:

- "We already cover 200 KOLs. Use credits to add *your* niche KOL that we don't track yet."
- User-contributed scrapes enrich the shared pool (network effect)

---

## GTM Implications

1. **Layer 1 fully open** = the "wow moment" is free. New users immediately see data depth, KOL accuracy scores, and coverage. This is shareable content for organic growth.
2. **Layer 2 partially gated** = free users get a taste (limited unlocks), then hit a soft wall. Pro conversion trigger: "I want to see all of this KOL's historical calls."
3. **Layer 3 credit-gated even for Pro** = creates natural upsell to Max. Pro users who frequently buy Layer 3 credits see the math: 10 unlocks/month × 5 credits = 50 credits = entire Pro budget. Max at $24.99 is the obvious upgrade.
4. **API on Max only** = positions Max as the "platform tier" for developers and AI agents consuming Baburra data. Future revenue upside.
