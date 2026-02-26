# Codex 5.3 Pro - Quick Review Prompt

## Instructions

You are reviewing code for **Baburra.io** - a Next.js 16 + React 19 + TypeScript application for tracking investment KOLs' opinions.

## Review Focus Areas

### Critical (Must Fix)
1. **TypeScript Errors**: Missing types, unsafe `as` assertions, compilation errors
2. **Security**: Authentication gaps, SQL injection risks, XSS vulnerabilities
3. **Runtime Errors**: Null/undefined access, unhandled exceptions

### High Priority
4. **Error Handling**: Inconsistent formats, missing error handling
5. **Code Quality**: Code duplication, complex functions, unclear naming
6. **Performance**: Unnecessary re-renders, inefficient queries, missing caching

### Medium Priority
7. **Best Practices**: React patterns, API design, testing coverage
8. **Maintainability**: Code organization, documentation

## Output Format

For each issue:

```markdown
### [Priority] Issue Title
**File**: `path/to/file.ts:line`
**Problem**: [Description]
**Fix**: [Specific code example]
```

## Code Patterns to Flag

❌ `any` types, unsafe `as` assertions, empty catch blocks, magic numbers
✅ Proper TypeScript types, consistent error handling, meaningful names

## Review Checklist

- [ ] TypeScript compilation errors
- [ ] Security vulnerabilities  
- [ ] Runtime error risks
- [ ] Performance bottlenecks
- [ ] Code consistency issues
- [ ] Missing error handling
- [ ] Test coverage gaps

---

**Start**: Review the provided code files and generate findings following the format above.
