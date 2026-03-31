## Why

Multiple features landed across PR#11, PR#12, and commit ccd6c05 — credit system, Gemini transcription, scrape UX fixes, duplicate rejection — but none have been manually verified end-to-end against the live database. Automated unit tests cover individual functions, but integration-level correctness (credit deductions, transcript caching, scrape job lifecycle) has not been validated. We need a structured QA pass before moving to new feature work.

## What Changes

- Define 12 QA scenarios covering scrape flow, credit system, Gemini transcription, and edge cases
- Each scenario has concrete pass/fail criteria including DB evidence queries
- Execute scenarios against dev environment using `DEV_USER_ID` auth bypass
- Document results and any bugs found

No application code changes — this is a testing-only change. Bugs found will be tracked as separate changes.

## Capabilities

### New Capabilities

- `qa-standards`: QA acceptance criteria and DB verification queries for scrape + credit features

### Modified Capabilities

_None — this is a verification pass, not a behavior change._

## Impact

- **No code changes** — read-only verification against existing implementation
- **Database reads** — verification queries against `profiles`, `posts`, `transcripts`, `scrape_jobs`, `kol_sources`
- **External API calls** — Gemini API (for transcription scenario B3), Tiingo API (for posts page load A2)
- **Credit consumption** — test scenarios will consume real credits from the dev user's balance
