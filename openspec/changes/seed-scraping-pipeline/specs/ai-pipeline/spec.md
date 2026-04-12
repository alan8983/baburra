## ADDED Requirements

### Requirement: Profile Scrape Service Overrides

The `profile-scrape.service` SHALL expose optional `ownerUserId`, `source`, and `quotaExempt` parameters (via a `ScrapeOverrides` interface) on its public scrape entry points, defaulting to current behavior when absent, so batch / system callers can record non-user ownership and bypass credit charges without duplicating the pipeline.

#### Scenario: Default call unchanged
- **WHEN** an API route calls the service without the overrides
- **THEN** the service uses the request-context `userId`, leaves `source` at its default, and charges credits normally
- **AND** behavior is byte-identical to the previous version

#### Scenario: Seed-style call with overrides
- **WHEN** a caller passes `{ ownerUserId: PLATFORM_UUID, source: 'seed', quotaExempt: true }`
- **THEN** every row written during that scrape (KOL, kol_source, post, argument) is owned by `PLATFORM_UUID`
- **AND** `kol_sources.source` and `posts.source` are set to `'seed'`
- **AND** no credit charges are applied (credit consumption is skipped)

#### Scenario: Historical depth via selectedUrls
- **WHEN** a caller passes `selectedUrls` (a slice of discovered URLs limited to N)
- **THEN** only those URLs are processed by the job, controlling depth without a new `maxPosts` parameter

### Requirement: Credit Exemption for Seed Scrapes

The seed scrape pipeline SHALL use `quotaExempt: true` to bypass the lego credit system, following the same pattern used by validation scrapes.

#### Scenario: No credits consumed during seed run
- **WHEN** the seed script processes URLs with `quotaExempt: true`
- **THEN** `consumeCredits()` is not called for any operation (discovery, download, transcription, AI analysis)
- **AND** the platform user's credit balance (if any) is unaffected

### Requirement: Quality Gate Applied Uniformly

The quality gate (content filter, Coverage ≥ 60%, Directionality ≥ 50%, Analytical depth ≥ 1.5) SHALL be applied identically regardless of the `source` value, with no branch that relaxes thresholds for seed data.

#### Scenario: Seed and user data held to same bar
- **WHEN** the pipeline processes a post
- **THEN** the quality-gate decision depends only on the extracted content's scores, not on `source` or `ownerUserId`
