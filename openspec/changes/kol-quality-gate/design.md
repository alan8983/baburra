## Context

Baburra currently allows any user to add KOLs to the shared pool via the scrape page (submit a profile URL → discover posts → import). There is no validation that the KOL produces backtestable investment content. The AI pipeline (`ai.service.ts`) identifies explicit stock tickers but ignores macro-focused content that discusses economic indicators, central bank policy, or industry trends without naming specific tickers.

Current flow: User submits URL → `POST /api/scrape/profile` → creates `kol_sources` + `scrape_jobs` → cron processes jobs → imports posts with AI analysis → KOL is immediately visible in the public pool.

## Goals / Non-Goals

**Goals:**
- Gate KOL entry into the public pool with automated quality validation
- Expand ticker identification to cover macro-to-instrument inference
- Track whether tickers are explicitly mentioned or AI-inferred throughout the data pipeline
- Provide clear feedback to users about validation status

**Non-Goals:**
- Community voting or crowdsourced KOL review
- Periodic re-validation of existing KOLs
- Configurable qualification thresholds (hardcoded for v1)
- Separate admin dashboard (simple filter on KOL list is sufficient)
- Changes to win rate calculation logic (inferred tickers treated same as explicit)

## Decisions

### D1: Validation as a scrape job variant (not a separate system)

**Decision**: Reuse the existing `scrape_jobs` infrastructure with a new `validation_scrape` job type rather than building a separate validation queue.

**Rationale**: The validation scrape is functionally identical to an `initial_scrape` — it discovers URLs, fetches content, runs AI analysis. The only differences are: (a) limited to 5-10 posts, (b) quota-exempt, (c) triggers scoring on completion. Reusing the job system avoids duplicating the scrape/import pipeline and leverages existing cron processing.

**Alternative considered**: Dedicated validation microservice or edge function. Rejected because it would duplicate scrape logic and add deployment complexity for a feature that runs infrequently (~10-50 KOL nominations per week).

### D2: Scoring in the job completion handler (not a separate step)

**Decision**: Run the qualification scoring function synchronously when the validation scrape job completes, within the same cron job processing cycle.

**Rationale**: Scoring is a pure computation over the already-imported posts — no external API calls, no heavy processing. Adding a separate async step would add latency and complexity for no benefit.

**Alternative considered**: Separate `validation_score` job type triggered after scrape completes. Rejected as over-engineered for a sub-second computation.

### D3: Macro inference embedded in the existing AI prompt (not a separate call)

**Decision**: Extend the existing `buildDraftAnalysisPrompt` in `ai.service.ts` to include macro inference rules, rather than making a separate Gemini call for macro analysis.

**Rationale**: The Gemini model already processes the full post content for ticker identification. Adding macro inference rules to the same prompt is a natural extension — the model can decide in one pass whether content contains explicit tickers, inferable macro topics, or neither. A separate call would double API costs and add latency.

**Alternative considered**: Two-pass approach (explicit ticker extraction → macro inference if zero tickers found). Rejected because it adds a conditional second API call and some posts contain BOTH explicit tickers and macro context.

### D4: Default existing KOLs to `active` status

**Decision**: The migration sets `validation_status = 'active'` for all existing KOL rows, and `source = 'explicit'` for all existing `post_stocks` rows.

**Rationale**: Existing KOLs were manually curated during seed data phase and have already passed informal quality review. Requiring re-validation would disrupt the existing data pool. New defaults ensure backward compatibility.

### D5: Rejected KOL posts are discarded (not soft-deleted)

**Decision**: When a KOL fails validation, the posts imported during the validation scrape are hard-deleted. The KOL record itself is kept with `validation_status = 'rejected'` and `validation_score` for audit.

**Rationale**: Validation posts are a small sample (5-10) used only for scoring. Keeping them in the pool would pollute it with content from a KOL that failed quality checks. The scoring result stored in `validation_score` JSONB provides full auditability without keeping the raw posts.

**Alternative considered**: Soft-delete via a `validation_only` flag on posts. Rejected because it adds query complexity (every post query needs to filter) for data that has no value after scoring.

### D6: `IdentifiedTicker` schema change propagated through pipeline

**Decision**: Add `source` and `inferenceReason` to the `IdentifiedTicker` interface in `ai.service.ts`. These fields flow through `import-pipeline.service.ts` → `post.repository.ts` → `post_stocks` table.

**Rationale**: The source tracking needs to be end-to-end. The AI service is where the classification happens, the database is where it's persisted, and the UI reads from the database. Passing it through the existing pipeline avoids any separate reconciliation step.

### D7: Qualification thresholds hardcoded as constants

**Decision**: Store the three qualification criteria (coverage ≥ 60%, directionality ≥ 50%, analytical depth ≥ 1.5) as named constants in a new `src/domain/services/kol-validation.service.ts` file.

**Rationale**: These are business rules that may need tuning but don't need to be user-configurable in v1. Named constants make them easy to find and adjust. A future change can move them to a config table if needed.

## Risks / Trade-offs

**[Risk] Macro inference accuracy may be inconsistent** → Mitigation: The `inferenceReason` field provides transparency. The "推論" UI badge signals to users that the mapping is AI-generated, not KOL-stated. Users can mentally discount inferred tickers. Future: add a feedback mechanism for users to flag incorrect inferences.

**[Risk] Validation scrape uses AI credits without user cost** → Mitigation: Validation scrapes are quota-exempt (system cost). At ~8 posts × 1 Gemini call per post, cost is ~$0.01 per KOL validation. At 50 nominations/week, this is negligible (~$0.50/week).

**[Risk] KOL with atypical recent content gets wrongly rejected** → Mitigation: Admin override allows manually setting `active`. The `validation_score` JSONB stores full scoring breakdown so admins can see why it failed. Future: re-validation with larger sample.

**[Risk] Existing `create_post_atomic` RPC doesn't accept source/inferenceReason** → Mitigation: Migration adds columns with defaults. The RPC function signature needs updating to accept the new fields. This is a contained change — one RPC function update.

**[Trade-off] Single inference instrument per macro topic** → The prompt instructs Gemini to pick the MOST directly affected instrument rather than returning multiple. This sacrifices completeness for clarity — a single clear mapping is more actionable than a list of vaguely related ETFs.

## Migration Plan

1. **DB migration 1**: Add `validation_status`, `validation_score`, `validated_at`, `validated_by` to `kols` table. Set existing rows to `active`. Add index.
2. **DB migration 2**: Add `source`, `inference_reason` to `post_stocks` table. Set existing rows to `explicit`.
3. **Update `create_post_atomic` RPC**: Accept and store new `post_stocks` fields.
4. **Deploy backend changes**: AI prompt, pipeline, repositories, API routes, validation service.
5. **Deploy frontend changes**: KOL list filter, scrape page status, inferred ticker badges.
6. **Rollback**: Drop new columns (data loss is acceptable for new fields — they have sensible defaults). Revert AI prompt (no lasting impact).

## Open Questions

- **Q1**: Should the validation scrape use the same content extractors as regular scrapes, or a lighter-weight version? **Tentative answer**: Same extractors — they're already built and tested. The 5-10 post limit provides the cost control.
- **Q2**: Should we notify the nominating user via in-app notification or just show status on the scrape page? **Tentative answer**: Status on scrape page is sufficient for v1. In-app notifications can be added later.
