## Why

Baburra uses a shared data model where all KOLs, posts, and analysis live in a common pool. Any user can nominate a KOL, creating a data quality risk: non-investment KOLs (educators, entertainers, general commentators) pollute the pool with content that cannot be backtested. During seed data curation, most initially obvious KOL choices failed the "explicit stock-specific calls" test. An automated quality gate is needed to enforce data quality without a manual review bottleneck.

Additionally, limiting validation to only "stock-picking" KOLs is too restrictive. Many popular Taiwan/global finance KOLs are macro-focused (economic indicators, central bank policy, industry trends). Their views ARE backtestable when mapped to tradeable instruments (indices, ETFs, bonds). The system must support both explicit ticker mentions and inferred macro-to-instrument mappings.

## What Changes

- **KOL validation lifecycle**: New `validation_status` field on `kols` table (`pending` → `validating` → `active` | `rejected`). Only `active` KOLs appear in the public pool.
- **Validation scrape job**: New `validation_scrape` job type that fetches 5-10 recent posts, runs AI analysis, and scores the KOL against qualification criteria (coverage, directionality, analytical depth).
- **Macro-to-instrument inference**: Enhanced AI ticker identification that infers tradeable instruments from macro content (e.g., Fed rate discussion → TLT, Taiwan GDP → 0050.TW). New `source` field (`explicit` | `inferred`) and `inferenceReason` on identified tickers.
- **Post-stock source tracking**: `post_stocks` table gains `source` and `inference_reason` columns to distinguish explicit mentions from AI-inferred mappings.
- **UI indicators**: Validation status on scrape page, `active`-only default filter on KOL list, "推論" badges on inferred tickers, footnotes on win rates including inferred tickers.
- **Admin override**: Rejected KOLs can be manually set to `active` for edge cases.

## Capabilities

### New Capabilities
- `kol-validation`: KOL qualification lifecycle — validation scrape triggering, scoring logic, status transitions, admin override
- `macro-inference`: Macro-to-instrument ticker inference — enhanced AI prompt for inferring tradeable instruments from macro content, source/reason tracking through the data pipeline

### Modified Capabilities
- `ai-pipeline`: Ticker identification output schema adds `source` and `inferenceReason` fields; prompt enhanced with macro inference rules
- `data-models`: `kols` table adds validation columns; `post_stocks` table adds source tracking columns
- `api-contracts`: KOL list endpoint filters by `validation_status`; new validation status endpoint

## Impact

- **Database**: 2 migrations — `kols` table (4 new columns + index), `post_stocks` table (2 new columns). Existing rows get default values (`active` for kols, `explicit` for post_stocks).
- **AI Service** (`src/domain/services/ai.service.ts`): Prompt changes for macro inference; output schema changes for `IdentifiedTicker`.
- **Import Pipeline** (`src/domain/services/import-pipeline.service.ts`): Must propagate `source`/`inferenceReason` through to `post_stocks` creation.
- **Repositories**: `kol.repository.ts` (validation status queries), `scrape-job.repository.ts` (new job type), `post.repository.ts` (source field on post_stocks).
- **API Routes**: `GET /api/kols` (filter by status), new validation-related endpoints.
- **UI Components**: KOL list page (status filter), input/scrape page (validation status indicator), post detail (inferred ticker badges).
- **Domain Models**: `KOL` interface (validation fields), `PostStockLink` (source field), `ScrapeJob` (new job type), `IdentifiedTicker` (source + inferenceReason).
