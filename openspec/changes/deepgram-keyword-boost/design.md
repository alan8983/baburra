## Context

Deepgram's `keywords` parameter is a per-request query argument:
`?keywords=tsmc:5&keywords=殖利率:3&...`. Each entry is `term:weight`. Higher weights bias the model more strongly toward that term but can hurt overall accuracy if overused — Deepgram recommends weights ≤ 5 unless you have a specific reason. The list is sent on every request; there is no Deepgram-side persistence.

## Goals / Non-Goals

**Goals:**
- Improve transcription accuracy on the terms that matter most for win-rate scoring.
- Keep the catalogue maintainable (PR-reviewable, versioned).
- Personalise per request without bloating a global list.

**Non-Goals:**
- A custom Deepgram model. Out of scope and overkill at our volume.
- Crowd-sourced or auto-mined jargon lists. Manual curation only for now.
- Multi-language keyword lists beyond zh-TW + en. Add later if needed.

## Decisions

### D1: Static catalogue + dynamic per-request injection
**Decision:** Tickers and jargon are static (in repo / DB). KOL names are injected per request based on the clip's `kol_id`.

**Rationale:** Keeps the global list bounded — sending all KOL names on every request would inflate request size and dilute weighting.

### D2: Default weight 2.0, ceiling 5.0
**Decision:** Default weight is 2.0 across all categories. Tickers may use 3.0. Nothing exceeds 5.0 without an explicit reason in the PR.

**Rationale:** Matches Deepgram's guidance. Avoids over-fitting that hurts general transcription quality.

### D3: Curated zh-TW jargon as a versioned `.txt` file
**Decision:** `src/domain/services/keywords/zh-tw-financial.txt`, one term per line, comments allowed with `#`. Loaded at module init.

**Rationale:** Plain text is reviewable in diffs. JSON adds noise. A DB table would block contributors who don't want to write a migration.

### D4: Tickers sourced from the `stocks` table at runtime
**Decision:** Pull active tickers from the existing `stocks` table on first request, cache in-memory for the process lifetime. Refresh on cache miss.

**Rationale:** Single source of truth. New tickers picked up automatically without code changes.

### D5: Feature flag for rollout
**Decision:** `DEEPGRAM_KEYWORD_BOOST_ENABLED` env var (default `false`). When false, the transcription service ignores all keyword logic and behaves as today.

**Rationale:** Lets us merge the code before the Deepgram plan upgrade lands, and lets us roll back without a deploy if accuracy regresses.

### D6: Telemetry on list size, not WER
**Decision:** Log keyword list size per request. Do not attempt to compute WER automatically — that requires ground-truth transcripts we don't have.

**Rationale:** WER measurement is its own project. List size is a cheap proxy for "is the feature actually doing anything".

## Risks / Trade-offs

**[Risk] Over-boosted weights hurt general transcription** — mitigation: D2 ceiling and PR review on any change above 3.0.

**[Risk] Jargon list staleness** — Taiwan financial vocabulary evolves slowly; quarterly review is enough. Document the review cadence in the README of the keywords folder.

**[Trade-off] Per-request injection adds latency** — looking up KOL aliases adds <5ms; acceptable.

**[Risk] Deepgram plan upgrade is operational, not code** — the code can ship feature-flagged but provides no value until ops moves the account. Mitigation: tasks include an explicit ops checklist item.
