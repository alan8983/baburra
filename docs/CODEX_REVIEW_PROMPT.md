# Codex 5.3 Pro Code Review Prompt

## Context
You are reviewing code for **Baburra.io** - a backtesting tool for retail investors to evaluate KOLs' investment opinions. The codebase uses:
- **Stack**: Next.js 16 (App Router) + React 19 + TypeScript + Supabase (PostgreSQL)
- **Architecture**: Layered architecture (Pages → Hooks → API Routes → Repositories → Supabase)
- **Codebase Size**: ~174 TypeScript/JavaScript files, ~22,629 lines of code

## Review Objectives

Conduct a comprehensive code review focusing on:

### 1. **Critical Issues** (Must Fix)
- **Type Safety**: TypeScript errors, missing type definitions, unsafe type assertions (`as` usage)
- **Runtime Errors**: Potential null/undefined access, unhandled exceptions, missing error boundaries
- **Security Vulnerabilities**: SQL injection risks, XSS vulnerabilities, authentication/authorization gaps
- **Build Failures**: Compilation errors, missing imports, circular dependencies

### 2. **Code Quality** (High Priority)
- **Error Handling**: Inconsistent error formats, missing error handling, silent failures
- **Code Consistency**: Inconsistent patterns, naming conventions, code style
- **Performance**: Unnecessary re-renders, missing memoization, inefficient queries, missing caching
- **Maintainability**: Code duplication, complex functions (>50 lines), unclear variable names

### 3. **Best Practices** (Medium Priority)
- **React Patterns**: Proper hook usage, component composition, state management
- **API Design**: RESTful conventions, error response formats, request validation
- **Database**: Query optimization, missing indexes, N+1 query problems
- **Testing**: Missing test coverage, untestable code patterns

### 4. **Architecture & Design** (Low Priority)
- **Separation of Concerns**: Proper layer boundaries, dependency direction
- **Scalability**: Potential bottlenecks, resource limits
- **Documentation**: Missing JSDoc comments, unclear business logic

## Review Format

For each issue found, provide:

```markdown
### [Priority] Issue Title

**Location**: `path/to/file.ts:line-number`
**Severity**: Critical / High / Medium / Low
**Category**: Type Safety / Security / Performance / Code Quality / Architecture

**Problem**:
[Clear description of the issue]

**Current Code**:
```typescript
// Show the problematic code snippet
```

**Impact**:
[Explain what could go wrong or what problems this causes]

**Recommendation**:
[Specific, actionable fix with code example]

**Example Fix**:
```typescript
// Show the corrected code
```
```

## Specific Areas to Focus On

### API Routes (`src/app/api/**`)
- ✅ Consistent error response format: `{ error: { code: string, message: string } }`
- ✅ Proper authentication checks using `getCurrentUserId()`
- ✅ Input validation (Zod schemas)
- ✅ Error handling with try-catch blocks
- ✅ Rate limiting considerations

### React Components (`src/components/**`, `src/app/**`)
- ✅ Proper TypeScript prop types
- ✅ Error boundaries for data fetching
- ✅ Loading and error states
- ✅ Accessibility (ARIA labels, keyboard navigation)
- ✅ Performance (useMemo, useCallback where appropriate)

### Domain Logic (`src/domain/**`)
- ✅ Pure functions (no side effects)
- ✅ Proper error handling
- ✅ Type safety
- ✅ Business logic validation

### Infrastructure (`src/infrastructure/**`)
- ✅ Repository pattern consistency
- ✅ Database query optimization
- ✅ External API error handling
- ✅ Caching strategies

### Hooks (`src/hooks/**`)
- ✅ Proper React Query usage
- ✅ Query key consistency
- ✅ Mutation invalidation
- ✅ Error handling

## Code Patterns to Flag

### Anti-patterns
- ❌ `any` types without justification
- ❌ `as` type assertions without validation
- ❌ `console.log` in production code (use proper logging)
- ❌ Empty catch blocks
- ❌ Magic numbers/strings (should be constants)
- ❌ Functions > 100 lines (should be split)
- ❌ Deeply nested conditionals (>3 levels)

### Good Patterns to Validate
- ✅ Proper use of TypeScript strict mode
- ✅ Consistent error handling patterns
- ✅ Proper async/await usage (no promise chains)
- ✅ Destructuring for clarity
- ✅ Early returns to reduce nesting
- ✅ Meaningful variable/function names

## Review Checklist

Before submitting review, ensure you've checked:

- [ ] All TypeScript compilation errors identified
- [ ] All security vulnerabilities flagged
- [ ] All potential runtime errors caught
- [ ] Performance bottlenecks identified
- [ ] Code consistency issues noted
- [ ] Missing error handling flagged
- [ ] Test coverage gaps identified
- [ ] Documentation gaps noted

## Output Format

Provide review in this structure:

```markdown
# Code Review Report

## Summary
- **Files Reviewed**: [count]
- **Critical Issues**: [count]
- **High Priority Issues**: [count]
- **Medium Priority Issues**: [count]
- **Low Priority Issues**: [count]

## Critical Issues
[Detailed issues with fixes]

## High Priority Issues
[Detailed issues with fixes]

## Medium Priority Issues
[Detailed issues with fixes]

## Low Priority Issues
[Detailed issues with fixes]

## Recommendations Summary
[Top 5-10 actionable recommendations]
```

## Review Guidelines

1. **Be Specific**: Provide exact file paths, line numbers, and code snippets
2. **Be Actionable**: Every issue should have a clear fix recommendation
3. **Prioritize**: Focus on critical and high-priority issues first
4. **Be Constructive**: Explain why something is wrong and how to fix it
5. **Consider Context**: Understand the business logic before suggesting changes
6. **Check Patterns**: Look for repeated issues that indicate systemic problems

## Additional Context Files

When reviewing specific files, also consider:
- `docs/ARCHITECTURE.md` - Architecture decisions
- `docs/API_SPEC.md` - API contract specifications
- `docs/INVARIANTS.md` - Business logic invariants
- `docs/DOMAIN_MODELS.md` - Domain model definitions

---

**Start Review**: Analyze the provided code files and generate a comprehensive review following the format above.
