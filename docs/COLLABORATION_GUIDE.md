# How to Work with Claude Code Efficiently

> Guidelines for productive human-AI collaboration on this project.
> **Last updated**: 2026-03-14

---

## 1. Start with Intent, Not Instructions

**Instead of:**
> "Add a `statement_type` column to `post_arguments`, update the repository, update the API, update the UI, add translations..."

**Say:**
> "I want to classify arguments as fact vs opinion so users can see credibility signals."

The **why** matters more than the **how**. Claude will propose the design via `/opsx:propose`, and you review before any code is written. This prevents rework.

## 2. Use the Right Entry Point

| What you want | What to say |
| --- | --- |
| New feature or significant change | `/opsx:propose <name>` — generates proposal + design + tasks for review |
| Explore/investigate before deciding | `/opsx:explore <topic>` — thinking partner mode, no code changes |
| Continue implementing an existing change | `/opsx:apply <name>` — picks up from the task checklist |
| Quick fix (typo, config, one-liner) | Just describe it — no OpenSpec needed |
| Review / understand code | Just ask — research without changing anything |

## 3. Session Structure

**At session start**, say one of:
- "Continue `<change-name>`" — resumes from the task list
- "New feature: `<description>`" — proposes via OpenSpec
- "Fix this bug: `<description>`" — investigates and fixes
- "Let's review `<topic>`" — researches, no code changes

**At session end**, say "wrap up" and Claude will:
- Archive completed changes
- Update phase status + backlog
- Commit and push

## 4. Provide Constraints Up Front

These save the most back-and-forth:

- **Scope limits**: "Only touch the backend, don't change the UI yet"
- **Priority**: "This is a quick win, keep it simple" vs "This needs to be thorough"
- **Dependencies**: "We're using library X for this" or "Don't add new dependencies"
- **Timeline context**: "This is for the v0.2.0 release" (helps scope correctly)

## 5. Review Proposals Before Implementation

When an OpenSpec proposal is generated, you'll see:
- **proposal.md** — What & Why & Scope (in/out)
- **design.md** — Technical approach
- **tasks.md** — Step-by-step checklist

**Push back early** — it's 100x cheaper to change a proposal than to redo implementation. Say things like:
- "Remove task 5, we don't need that"
- "The design should use X instead of Y"
- "Add a task for migration rollback"

## 6. Use Batching for Efficiency

**Good** (one session, multiple related tasks):
> "Let's do Phase 15-lite: add `ai_model_version` to posts, create the reanalyze API, and add the UI button."

**Less efficient** (multiple sessions for related work):
> Session 1: "Add the column" / Session 2: "Now add the API" / Session 3: "Now the UI"

Each session has context-loading overhead. Batch related work together.

## 7. Reference Points

When describing what you want, reference existing patterns:
- "Like how `use-kols.ts` works, but for subscriptions"
- "Same pattern as the import pipeline"
- "See the scrape-flowchart-queue proposal for the UX I want"

The archived changes in `openspec/changes/archive/` are a searchable library of past decisions.

## 8. What Claude Handles Automatically

You don't need to remind Claude to:
- Run `type-check`, `lint`, `test` after code changes
- Update i18n (zh-TW + en) for new UI strings
- Map snake_case DB to camelCase domain models
- Invalidate React Query caches in mutations
- Update `openspec/specs/` when adding APIs or changing schema

## 9. Quick Reference Card

```
/opsx:propose <name>     — Plan a new change (generates proposal + design + tasks)
/opsx:apply <name>       — Implement from task checklist
/opsx:archive <name>     — Archive completed change
/opsx:explore <topic>    — Research without creating artifacts

Key docs:
  docs/WEB_DEV_PLAN.md          — Roadmap (slim, ~200 lines)
  docs/BACKLOG.md               — User story checklist
  openspec/specs/               — Living technical specs
  openspec/changes/archive/     — Past decisions & designs
```
