# Plan: Remove Unnecessary Comments

## Overview
Remove obvious comments that don't add informational value beyond what the code clearly shows.

## In `filesystem/index.ts`:

### Comments to Remove:
1. **Line 96**: `// Skip empty paths` - obvious from `if (!path)`
2. **Line 107**: `// Skip empty components and current directory references` - obvious from the condition
3. **Line 110**: `// no-op if stack is empty` - obvious from `components.pop()`
4. **Line 122**: `// Join components back together` - obvious from `components.join("/")`
5. **Line 180**: `// Check cache first` - obvious from cache check
6. **Line 185**: `// Get file from map` - obvious from map get operation
7. **Line 195**: `// Cache the result` - obvious from cache set operation
8. **Line 266**: `// Auto-detect format if not specified` - obvious from the logic
9. **Line 276**: `// Convert bytes to text` - obvious from TextDecoder usage
10. **Line 282**: `// Handle Jsonnet compilation` - obvious from the import and call

### Comments to Keep:
- **Line 241**: `// Prefer jsonnet over json (same as Rust implementation)` - provides useful context about design decision

## In `filesystem.test.ts`:

### Comments to Remove:
1. **Lines 10-30**: The import grouping comments (`// Path utilities`, `// File system`, etc.) - these are obvious from the import names themselves

## Comments to Always Keep:
- JSDoc comments (these provide API documentation)
- Section divider comments (`// ============`)
- Comments explaining business logic or non-obvious behavior
- Comments in the JSDoc examples within normalizedPathJoin

## Outcome
This will make the code cleaner while preserving meaningful documentation that adds real value for developers.