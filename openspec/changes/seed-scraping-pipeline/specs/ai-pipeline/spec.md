## ADDED Requirements

### Requirement: Profile Scrape Service Overrides

The `profile-scrape.service` SHALL expose optional `maxPosts`, `ownerUserId`, and `source` parameters on its public scrape entry points, defaulting to current behavior when absent, so batch / system callers can request historical depth and record non-user ownership without duplicating the pipeline.

#### Scenario: Default call unchanged
- **WHEN** an API route calls the service without the overrides
- **THEN** the service uses the current default `maxPosts`, the request-context `userId`, and leaves `source` at its default
- **AND** behavior is byte-identical to the previous version

#### Scenario: Seed-style call with overrides
- **WHEN** a caller passes `{ maxPosts: 50, ownerUserId: PLATFORM_UUID, source: 'seed' }`
- **THEN** the discovery phase requests up to 50 URLs
- **AND** every row written during that scrape (KOL, profile_scrape, post, argument) is owned by `PLATFORM_UUID`
- **AND** `profile_scrapes.source` and `posts.source` are set to `'seed'`

### Requirement: Quality Gate Applied Uniformly

The quality gate (content filter, Coverage ≥ 60%, Directionality ≥ 50%, Analytical depth ≥ 1.5) SHALL be applied identically regardless of the `source` value, with no branch that relaxes thresholds for seed data.

#### Scenario: Seed and user data held to same bar
- **WHEN** the pipeline processes a post
- **THEN** the quality-gate decision depends only on the extracted content's scores, not on `source` or `ownerUserId`
