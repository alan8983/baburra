# Data Models Spec

> Living spec for Baburra.io database schema and domain models.
> **Canonical source**: `docs/DOMAIN_MODELS.md` for domain types, `supabase/migrations/` for DB schema.

## Core Tables

| Table | Type | Description |
| --- | --- | --- |
| `profiles` | Private | User profile, AI usage, subscription tier |
| `kols` | Shared | KOL directory (name, slug, avatar, social links) |
| `stocks` | Shared | Investment targets (ticker, name, market) |
| `posts` | Shared | Published articles with sentiment, content, source URL |
| `post_stocks` | Shared | Many-to-many: post ↔ stock |
| `stock_prices` | Shared (cache) | Daily OHLCV price data from Tiingo |
| `post_arguments` | Shared | AI-extracted investment arguments per post per stock |
| `argument_categories` | Shared (seed) | 7 analysis framework categories |
| `drafts` | Private | User drafts (pre-publication) |
| `bookmarks` | Private | User bookmarks on posts |
| `kol_sources` | Shared | KOL platform identity + scrape state |
| `kol_subscriptions` | Private | User subscriptions to KOLs |
| `scrape_jobs` | Shared | Background scrape job queue |

## Domain Model Conventions

- DB columns: `snake_case`
- Domain models (TypeScript): `camelCase`
- Each repository maps DB → domain in its `map*()` function
- All repositories use `createAdminClient()` to bypass RLS

## Key Relationships

```
profiles ──< drafts
profiles ──< bookmarks
profiles ──< kol_subscriptions
kols ──< posts ──< post_stocks >── stocks
kols ──< kol_sources
posts ──< post_arguments >── stocks
posts ──< post_arguments >── argument_categories
stocks ──< stock_prices
```

## Recent Schema Changes

| Migration | Description | Date |
| --- | --- | --- |
| 20250602 | Remove onboarding columns, add `first_import_free` | 2026-03-18 |
| 027 | `post_arguments.statement_type` (fact/opinion/mixed) | 2026-03-13 |
| 019-026 | Phase 12b tables (kol_sources, kol_subscriptions, scrape_jobs) | 2026-03-08 |
| 017-018 | DB atomic operations | 2026-03-01 |

> For full migration history, see `supabase/migrations/`.
