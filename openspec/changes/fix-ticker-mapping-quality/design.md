# Design — fix-ticker-mapping-quality

## Context

The diagnostic findings (see `proposal.md` Why section) showed the root cause is at the **AI → DB seam**: the pipeline trusts Gemini's `{ticker, name, market}` triple verbatim. Three classes of error survive that seam today:

1. **Hallucinated tickers** (`CLAUDE`, `CHROME`, `SPACEX`, `MARVELL`) — Gemini emits the company name in caps as a fake ticker.
2. **Wrong company names for real tickers** (`2353.TW = "宏捷"` instead of `"宏碁"`; `2881-2897.TW` all named "First Financial Holding") — Gemini gets the ticker right but mis-labels it.
3. **Free-form fabrications** (`馮君 → 9 unrelated tickers`) — Gemini invents a person's surname as a stock and binds it to multiple unrelated codes.

A Gemini-side prompt-engineering fix would address the symptoms but not the class of bug — any LLM (Claude, GPT) will hallucinate on the Taiwan listings tail. The structural fix is **registry-grounding the upsert step**.

## Goals

- **G1**: New stocks rows are created **only** if the ticker exists in an authoritative registry.
- **G2**: New stocks rows take their `name` from the registry, not from Gemini.
- **G3**: Existing 90 fabricated stocks rows are remapped to their canonical equivalents (where one exists) or deleted (where none does), with an audit trail.
- **G4**: Future bypass paths (raw seed scripts, future webhook ingestion, hand-edits) cannot insert garbage. Enforced at the DB layer via FK.

## Decisions

### D1: Where does the registry live?

**Decision**: A new `stocks_master` table in Supabase, seeded from three sources:

- **US**: Tiingo's `supported_tickers.csv` (downloadable, ~75k rows; trim to the markets we care about during seed).
- **TW**: TWSE 上市 + TPEX 上櫃 listings, scraped once from `isin.twse.com.tw` via a one-time `scripts/build-tw-master.ts`.
- **CRYPTO**: Hand-curated `crypto_master.json` (~50 entries: BTC, ETH, SOL, etc.).

**Why a DB table and not in-memory JSON files?**

- In-memory works for TW (~2k) and CRYPTO (~50). It does **not** work for US (~75k tickers — non-trivial to ship in bundle, cold-start cost).
- A table makes the FK enforcement at the DB layer simple (`ALTER TABLE stocks ADD CONSTRAINT fk_master FOREIGN KEY (ticker) REFERENCES stocks_master(ticker)`).
- Single source of truth — no risk of in-memory and DB drifting out of sync.

**Rejected alternative**: Live Tiingo lookup per upsert. Adds 100-300 ms HTTP latency per *new* ticker per import; rate-limit risk during batch backfills. The seeded table is read-only after seed and serves all three markets uniformly.

### D2: What is the validation contract?

`resolveStock(rawTicker, market) → { ticker, name, market } | null`

Algorithm:

1. **Normalize**:
   - Trim, uppercase.
   - For `market='TW'`: if input matches `/^\d{4,6}$/`, append `.TW`. (`2357 → 2357.TW`.)
   - For `market='TW'`: if input is non-numeric (e.g. `ASUS`, `UMC`, `VIS`), return `null` — the master will reject and we don't want to attempt fuzzy fallback in v1.
2. **Lookup**: `SELECT name, market FROM stocks_master WHERE ticker = $1 AND market = $2`.
3. **Hit**: return `{ ticker: master.ticker, name: master.name, market: master.market }` — note `name` overrides whatever Gemini supplied.
4. **Miss**: log at info `[ticker-resolver] dropped ${ticker} (${market}) — not in master` and return `null`.

Caller (`import-pipeline.service.ts`) treats `null` as "drop this ticker from the post." A post that loses *all* its tickers this way still goes through the existing zero-ticker path at L617-633 (refund credits, mark `no_tickers_identified`).

**No fuzzy match in v1.** A name-collision case like `2353.TW` (registry says 宏碁) where Gemini said 宏捷 will resolve correctly because we override the name. Cases like `MARVELL` (Gemini's bad ticker for MRVL) get dropped; that's a regression for 6 existing posts but the alternative is shipping a fuzzy matcher in this change, which would balloon scope.

### D3: How do we cleanly handle existing data?

`scripts/cleanup-fabricated-stocks.ts` runs **after** the validation layer is live, so no new garbage flows in during cleanup.

The script processes the 90 suspicious rows in three buckets:

| Bucket | Handling | Examples |
| --- | --- | --- |
| **A. Remap to canonical** | Look for an existing `stocks` row with the canonical ticker; rewrite `post_stocks.stock_id` to point there; delete the orphan. | `MARVELL → MRVL`, `CONFLUENT → CFLT`, `CLOUDFLARE → NET`, `2357 → 2357.TW` |
| **B. Pure delete** | No canonical equivalent exists or the ticker is conceptually nonsense; cascade-delete `post_stocks` linkages then the stock row. | `馮君`, `CHROME`, `MODEL 3`, `SPACEX`, `^TWII`, `DI0T` |
| **C. Re-canonicalize name only** | Ticker is real but name is wrong; UPDATE `stocks.name` from the registry, no row changes elsewhere. | `2353.TW`: name `"宏捷"` → `"宏碁"` |

The script:

- Always runs `--dry-run` first by default; needs explicit `--apply` to mutate.
- Writes every action to `scripts/cleanup-fabricated-stocks.log` (timestamp, action, before/after).
- Is idempotent: running it twice produces no further changes after the first apply.

### D4: Why not just patch the prompt and call it done?

Considered. Rejected because:

- The current prompt already says "use canonical Taiwan codes (e.g. `2330.TW`)" — the model still emits non-canonical forms.
- The current prompt already lists ~10 known Chinese-name → ticker mappings — Gemini still invents `馮君` because it doesn't know the listings tail.
- Even GPT-4 / Claude Opus would hallucinate on the long tail of Taiwan small-caps. The fundamental problem is that this is a **lookup task being framed as a generation task**.
- Registry validation makes the model choice irrelevant for ticker correctness, which decouples this concern from cost/latency tradeoffs in the LLM stack.

### D5: Why not switch from Gemini to Claude/GPT?

The user offered. We don't take the offer because:

- Sentiment + argument extraction works fine on Gemini Flash-Lite at the current price point.
- Ticker hallucination is a **grounding** problem, not a **capability** problem; switching models doesn't fix it.
- Validation against the registry catches Gemini AND any future LLM's hallucinations uniformly.
- A separate, smaller follow-up could move ticker extraction to a constrained-output call (Tiingo+TWSE registry as explicit context, structured output forces ticker enum) — that change can choose any model freely.

If, after this change ships, validation reject rate stays meaningfully high (e.g. >5% of Gemini-emitted tickers get dropped), revisit. Until then, stay on Gemini.

## Risks

- **R1**: Registry seed quality. If TWSE/TPEX scraper misses a listing or Tiingo's `supported_tickers.csv` is stale, we silently drop valid tickers.
  - *Mitigation*: log every drop. Spot-check the first 100 drops post-deploy; add the missed tickers to the master if they're real.
- **R2**: Some posts will lose all their tickers during cleanup and become orphaned.
  - *Mitigation*: cleanup script reports the count of newly-orphaned posts; user can decide whether to delete them or leave as-is. Existing zero-ticker posts already exist, so this isn't a new state.
- **R3**: FK constraint will fail to apply if any row in `stocks` has a ticker not in `stocks_master`.
  - *Mitigation*: cleanup script runs **before** the FK migration. Migration order: (a) seed `stocks_master`, (b) run cleanup, (c) add FK.
- **R4**: TWSE/TPEX listings drift over time (~weekly). New IPOs may not be recognized for some weeks.
  - *Mitigation*: out of scope for v1. Add a refresh job in a separate change. In the meantime, log drops and add manually if a real ticker is missed.
- **R5**: Cleanup script bug could delete real data.
  - *Mitigation*: `--dry-run` default; audit log; reviewer runs dry-run, examines log, then applies. Snapshot DB before apply.

## Open Questions

1. Should the cleanup also touch posts where ALL stocks were fabrications and there are now zero stocks attached — delete those posts? Recommend leaving them as-is for the user to triage manually; conservative.
2. Should `stocks_master` include `aliases` (so `Marvell Technology` could be auto-resolved to `MRVL`)? Out of scope; add only if validation reject rate is high in production.
3. Should the cleanup script also re-run AI analysis for impacted posts to recover any missing tickers? Out of scope; this is a data-correctness fix, not an analysis-quality fix.
