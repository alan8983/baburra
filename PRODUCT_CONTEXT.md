# Baburra — Product Context (AI Session Reference)

> **Purpose:** Companion to `CLAUDE.md`. Where `CLAUDE.md` covers coding conventions and workflow,  
> this file covers product state, UX inventory, and market context for non-coding discussions.  
> **Last generated:** 2026-04-10 from `alan8983/investment-idea-monitor` (main branch)

---

## 1. Product Summary

**Baburra** is a community-shared investment KOL (Key Opinion Leader) monitoring and backtesting platform targeting Taiwan retail investors. Users track KOLs across social platforms; AI extracts and structures their investment opinions; historical data compounds into a backtesting moat.

- **URL:** baburra.vercel.app
- **Current version:** v0.2.0-dev
- **Users:** Zero paying users (pre-launch)
- **Immediate goal:** First 100 paying users

---

## 2. Pricing Tiers

| Tier | Price | Monthly Credits | Key Gates |
|------|-------|-----------------|-----------|
| Free | $0 | 500 | Layer 2: 3 free unlocks/mo |
| Pro | $9.99/mo | 5,000 | Full Layer 2; Layer 3 credit-gated |
| Max | $24.99/mo | 25,000 | Full Layer 2 + Layer 3; API access |

**Credit costs:** KOL scrape = 3 credits · Layer 2 unlock = 1 credit · Layer 3 unlock = 100 credits · À la carte = $0.50/credit

**Data layers:**
- **Layer 1** — Open to all: KOL profiles, accuracy scores, per-post summaries, sentiment ratios
- **Layer 2** — KOL deep dive: full argument chain, backtest detail, stance timeline (per KOL × ticker)
- **Layer 3** — Stock page: cross-KOL comparison, consensus vs. contrarian signal (requires 6mo data depth)

---

## 3. Platform Integrations (Extractor Status)

| Platform | Profile Scrape | Post Import | Notes |
|----------|---------------|-------------|-------|
| YouTube | ✅ Full | ✅ Captions + Gemini transcription | Shorts (≤60s) handled separately |
| YouTube Shorts | ✅ | ✅ Gemini-first, Deepgram fallback | Pre-filter: `isLikelyInvestmentContent()` |
| Twitter/X | ✅ | ✅ oEmbed (free) | |
| Podcast RSS | ✅ | ✅ Three-tier transcript fallback | Covers Spotify + Apple via RSS |
| TikTok | ✅ Backend | ✅ Backend | Requires Apify API token |
| Facebook | ✅ Backend | ✅ Backend | Requires Apify API token |

**Known UI gap:** Podcast URL detection patterns exist in `detect-profile-platform.ts` (unified-input-page change completed) — BUG-001 from earlier sessions should now be resolved.

---

## 4. App Page Inventory

All protected routes live under `src/app/(app)/`. Auth: Supabase Auth + Google OAuth.

| Route | Page | Status | Key Features |
|-------|------|--------|--------------|
| `/` | Marketing homepage | ✅ | Hero, features, pricing table, FAQ (Phase 17) |
| `/login` `/register` | Auth pages | ✅ | Email + Google OAuth, password reset |
| `/dashboard` | Dashboard | ✅ | Stats overview, KOL/stock counts, AI quota |
| `/kols` | KOL list | ✅ | Search, add new KOL |
| `/kols/[id]` | KOL detail | ✅ | K-line chart + sentiment markers, win rate, argument timeline |
| `/stocks` | Stock list | ✅ | Search, add ticker |
| `/stocks/[id]` | Stock detail | ✅ | Cross-KOL argument comparison (Layer 3 — data depth pending) |
| `/input` | Unified input page | ✅ | Smart textarea (text/post URLs/profile URL), scrape wizard, recent jobs, quick-nav sidebar |
| `/posts` | Post list | ✅ | Filter by KOL/stock/sentiment |
| `/posts/[id]` | Post detail | ✅ | Full arguments, bookmarks, re-analyze |
| `/drafts` | Draft list | ✅ | Pending review posts |
| `/bookmarks` | Bookmarks | ✅ | Saved posts |
| `/settings` | Settings | ✅ | Timezone, color palette (Asian/American), subscription tier |
| `/welcome` | A/B variant B | ✅ | 2-step pre-registration (50/50 split via middleware) |

---

## 5. AI Pipeline

```
Content → Extractor → Transcript (Deepgram Nova-3 or Gemini File API) → Gemini Extraction → Structured Arguments
```

- **Model:** Gemini 2.5 Flash-Lite (current, via `AI_SENTIMENT_MODEL` env var)
- **Output:** Structured JSON via `responseSchema` API — tickers, sentiment, arguments, confidence, statement type (fact/opinion)
- **Quality gate:** Coverage ≥60%, Directionality ≥50%, Analytical depth ≥1.5
- **Multi-round verification:** `verifyArguments()` cross-checks extracted claims
- **Upgrade path:** Gemini 2.5 Flash — zero migration effort, optional thinking mode

---

## 6. Active OpenSpec Changes (as of 2026-04-10)

### Mostly Complete (browser/manual tests remaining)
| Change | Done | Pending |
|--------|------|---------|
| `long-video-transcription` | Core impl (yt-dlp + Gemini File API), short video test | Browser MCP tests for long video (50min+), cache test |
| `tier-layer-unlocks` | All code (unlock service, repos, APIs, tier constants reset) | `supabase db push` (awaiting confirmation) |

### All Code Done (archive candidates)
| Change | Summary |
|--------|---------|
| `input-page-dashboard-layout` | Dashboard/KOL/Stock quick-nav sidebar on input page |
| `podcast-rss-extractor` | Full podcast extractor (Spotify/Apple/RSS) + VTT parser |
| `rework-credit-cost-lego` | Credit cost as composable recipe blocks (`CreditBlock`, `Recipe`, `composeCost`) |
| `unified-input-page` | Smart input detects text/post-URLs/profile-URL; profile wizard inline; unified from scrape page |
| `youtube-shorts-coverage` | Shorts detection, content pre-filter, Gemini-first transcription, auto-filter in discovery list |

### Not Started
| Change | Summary |
|--------|---------|
| `cron-incremental-monitoring` | Notifications table + smarter incremental check (discover newer videos only) + cron improvements |
| `deepgram-keyword-boost` | Financial term keyword list injected into Deepgram requests (needs Deepgram Growth plan) |
| `podcast-duration-probe` | HEAD request to estimate podcast duration when `<itunes:duration>` missing |
| `subscription-deepening-scrape` | Historical backfill of older posts for subscribed KOL sources |

---

## 7. Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data model | Fully shared (community pool) | Compounding moat; network effects |
| Podcast strategy | RSS (open standard) | Covers Spotify + Apple, zero anti-scraping friction, no extra API keys |
| Short-form video | Pre-filter before transcription | ~12× cheaper per data point, avoid waste on emotional/non-investment content |
| Macro KOLs | Gemini infers tradeable instruments (ETFs/bonds) | Broadens KOL coverage without changing pipeline |
| Credit architecture | `CreditBlock` + `Recipe` + `composeCost()` | Single source of truth, composable, extractor-driven |
| Transcription | Deepgram Nova-3 primary, Gemini File API fallback | Deepgram faster/cheaper; Gemini handles long-form (>2hr) |

---

## 8. Infrastructure

| Service | Plan | Monthly Cost | Notes |
|---------|------|-------------|-------|
| Vercel | Hobby (current) | $0 | Crons removed (Pro-only); upgrade to Pro ($20) when cron needed |
| Supabase | Pro | $25 | Project ID: `jinxqfsejfrhmvlhrfjj` |
| Deepgram | Free credit ($200) | $0 (for now) | Covers ~46,500 min batch transcription |
| Gemini | Pay-per-use | ~$0.10–0.20/mo at seed scale | |
| **Total** | | **~$26–46/mo** | |

---

## 9. Seed Data & Go-to-Market

**Seed scraping:** Platform absorbs cost of scraping ~30 seed KOLs bi-weekly (YouTube + Twitter + Podcast RSS). Grows to 60 KOLs over 12 months. Estimated ~$12–24/mo variable cost at current scale.

**User acquisition (3-circle strategy):**
1. Personal network (M1-M2) — curiosity framing, validate KOL accuracy
2. Facebook investment communities (M2-M4) — data-driven content posts
3. X build-in-public (M3+) — compounding organic

**Pre-condition before invitations:** Run 3 KOL scrapes personally to validate QA pipeline end-to-end.

**Financial projections (from product model):**
- Cash-flow positive: ~Month 3
- Month 12: ~48 paying users, ~$620 gross revenue, ~$70/mo platform cost
- ARPU (paying): ~$12.50–13

---

## 10. Known Issues / Technical Debt

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| Vercel cron | P0 | `crons` block in `vercel.json` breaks Hobby deploys | Fixed (removed) |
| Layer 3 depth | Structural | Stock page needs 6mo seed data to be valuable | By design — target M6 |
| `tier-layer-unlocks` DB push | Blocking | Migration written but not yet pushed to production | Pending user confirmation |
| BUG-002 | Minor | i18n copy still says "YouTube only" in some strings | May be resolved by `unified-input-page` |
| BUG-003/004 | Minor | Icon helper + APIFY error handler gaps | Check after `unified-input-page` merge |

---

## 11. Deferred Until 100 Paying Users

- Open-sourcing TWSE client
- Anthropic Startup Program application (for Claude Haiku credits)
- Pricing experiments
- Paid ads
- GitHub MCP connector (workaround: `git clone --depth 1` via bash)
