# Codex 5.3 Pro Code Review - Quick Start Guide

## 📋 Review Prompt

Use the comprehensive prompt in **`docs/CODEX_REVIEW_PROMPT.md`** for detailed review instructions.

## 🚀 Quick Usage

### Option 1: Review Specific Files
```
Review the following files focusing on [critical issues / type safety / performance]:
- src/app/api/quick-input/route.ts
- src/domain/services/ai.service.ts
- src/infrastructure/repositories/stock-price.repository.ts

[Paste the prompt from CODEX_REVIEW_PROMPT.md]
```

### Option 2: Review by Module
```
Review all API routes in src/app/api/ focusing on:
1. Error handling consistency
2. Authentication checks
3. Input validation
4. Type safety

[Paste the prompt from CODEX_REVIEW_PROMPT.md]
```

### Option 3: Full Codebase Review
```
Conduct a comprehensive code review of the Investment Idea Monitor codebase.
Focus areas: Critical issues, Type safety, Security, Performance, Code quality.

[Paste the full prompt from CODEX_REVIEW_PROMPT.md]
```

## 💰 Cost Estimation

Based on your codebase size (~721 KB, ~22,629 lines):

- **Single file review**: ~$0.10-0.30 per file
- **Module review** (5-10 files): ~$0.50-1.50
- **Full codebase review**: ~$1.00-2.00

**Recommendation**: Review in batches by module to optimize costs.

## ⚠️ Current TypeScript Issues

Before running Codex review, fix these TypeScript configuration issues:

1. **Missing .next type files**: Run `npm run dev` first to generate types
2. **SENTIMENT_LABELS errors**: These appear to be stale - verify by running fresh type-check after dev server

## 📝 Review Workflow

1. **Prepare**: Fix TypeScript errors first
2. **Select Scope**: Choose files/modules to review
3. **Run Codex**: Use prompt from `CODEX_REVIEW_PROMPT.md`
4. **Implement Fixes**: Apply recommendations from review
5. **Verify**: Run tests and type-check after fixes

## 🎯 Priority Review Areas

Based on initial analysis, prioritize:

1. **API Routes** (`src/app/api/**`) - Error handling consistency
2. **Type Safety** - Remove unsafe `as` assertions
3. **Error Handling** - Standardize error response formats
4. **Performance** - Optimize database queries and caching
5. **Testing** - Increase test coverage

---

**Next Steps**: 
1. Fix TypeScript config issues
2. Select review scope
3. Run Codex with the prompt
4. Implement recommendations
