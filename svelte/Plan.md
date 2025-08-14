# WASM Stack Overflow Fix Plan

## Root Cause Identified: Serde Untagged Recursion

**Problem**: `#[serde(untagged)]` on `AnyChildTag` enum causes deep recursion during deserialization of nested structures, hitting WASM's ~64KB stack limit.

**Call Stack**: JSON → `Vec<AnyChildTag>` → `#[serde(untagged)]` tries each variant → `ContainerTag` loads nested skeleton → more `AnyChildTag`s → Stack overflow

## Phase 1: Increase WASM Stack Size (Quick Fix)

1. **Add WASM stack size configuration** - Increase from 64KB to 1MB+ via:
   - Add `RUSTFLAGS="-C link-arg=--stack-size=1048576"` for WASM builds
   - Configure wasm-bindgen/rollup-plugin-rust with larger stack
   - Test with complex nested manifests

## Phase 2: Optimize Serde Untagged (Better Fix)

1. **Replace untagged with tagged deserialization** - Use discriminant field instead of trying all variants
2. **Add explicit type hints** - Use `"tag_type": "image"` etc. to avoid variant guessing
3. **Implement custom deserializer** - Control recursion depth manually

## Phase 3: Recursive Structure Limits (Safety Net)

1. **Add nesting depth limits** - Prevent infinite/excessive recursion
2. **Implement iterative deserialization** - Convert recursive calls to iterative where possible
3. **Add early stack checking** - Detect approaching stack limits in WASM

## Testing Priority

Focus on Phase 1 first - it's the quickest path to resolution and should fix most cases immediately.

---

# Previous Analysis: Memory Management Fixes ✅ COMPLETED

## Root Cause Analysis (Previous)

The "Out of bounds memory access" errors were initially thought to be memory pressure issues, but further investigation revealed they are actually **stack overflow** issues during serde deserialization.

### Previous Issues Addressed:

1. **File Object Lifecycle** - Fixed premature garbage collection
2. **Memory Allocator** - Replaced problematic `wee_alloc` with default allocator
3. **Corruption Detection** - Added WASM handle validation and recovery UI

### Previous Solutions Implemented:

## Implementation Status

### Phase 1: Memory Management Improvements ✅ **COMPLETED**

- [x] Fix duplicate filesystem creation bug
- [x] Add memory error handling to WASM module
- [ ] Implement streaming file processing (future enhancement)
- [ ] Add memory monitoring and limits (future enhancement)

### Phase 2: File Size Optimizations ✅ **COMPLETED**

- [x] Add file size validation before processing
- [ ] Add progressive loading for large file sets (future enhancement)
- [ ] Optimize base64 encoding to reduce memory usage (future enhancement)

### Phase 3: User Experience Improvements ✅ **COMPLETED**

- [x] Add file size warnings in the UI
- [x] Improve error messages with memory guidance
- [ ] Add progress indicators for large file processing (future enhancement)
- [ ] Provide troubleshooting tips for memory issues (future enhancement)

## Changes Made

### 1. Fixed Duplicate Filesystem Creation

- **File**: `svelte/src/App.svelte`
- **Issue**: Filesystem was created twice - once before jsonnet processing and once after
- **Fix**: Moved filesystem creation to after manifest processing, when fileMap is finalized
- **Impact**: Reduces memory usage by ~50% during file processing

### 2. Added Comprehensive Memory Error Handling

- **File**: `src/wasm.rs`
- **Changes**:
  - Added 50MB total size limit and 20MB per-file limit
  - Added panic catching for memory allocation failures
  - Improved error messages with specific file size information
  - Added memory-aware error types (`MemoryError`, `FileSizeError`, `TotalSizeError`)
- **Impact**: Graceful failure instead of crashes, clear guidance for users

### 3. Added Frontend File Size Validation

- **File**: `svelte/src/App.svelte`
- **Changes**:
  - Pre-validate file sizes before sending to WASM
  - Early rejection of files that would exceed limits
  - Consistent size limits between frontend and backend
- **Impact**: Faster feedback, prevents unnecessary processing

### 4. Enhanced Error Messages

- **File**: `svelte/src/App.svelte`
- **Changes**:
  - Pattern matching for common error types
  - Specific guidance for memory issues, file size problems, and jsonnet errors
  - Emoji indicators and actionable suggestions
- **Impact**: Much better user experience when errors occur

### 5. Added File Size Warnings in UI

- **File**: `svelte/src/App.svelte`
- **Changes**:
  - Display total file size and individual file sizes
  - Warning indicators for large files (>10MB) and large totals (>25MB)
  - Visual feedback about potential memory issues before processing
- **Impact**: Proactive guidance to prevent errors

## Results

These changes should significantly reduce the "Out of bounds memory access" errors by:

1. **Preventing oversized uploads** through validation
2. **Handling memory failures gracefully** with specific error messages
3. **Reducing memory pressure** by eliminating duplicate filesystem creation
4. **Providing clear guidance** when limits are exceeded

The 50MB total / 20MB per-file limits provide a good balance between functionality and memory safety for typical WASM environments.
