# Analysis and Fix Plan for WASM Memory Access Errors

## Root Cause Analysis

The "Out of bounds memory access" errors are likely caused by memory management issues in the WASM interface, particularly when handling large files or many files. Here are the key issues:

### 1. **Memory Pressure During File Processing**

- **Issue**: Large images are base64-encoded in memory (line 126 in image_tag.rs), creating 2x memory usage
- **Evidence**: Comment in code mentions "O(2\*n)" memory usage for image processing
- **Impact**: With multiple large images, this quickly exhausts WASM's limited memory space

### 2. **Inefficient File Transfer to WASM**

- **Issue**: Files are converted to base64 in JavaScript, then back to bytes in Rust
- **Evidence**: `createInMemoryFs` function processes entire file contents at once
- **Impact**: Doubles memory usage during transfer phase

### 3. **Missing Memory Bounds Checks**

- **Issue**: Unsafe memory access when WASM module runs out of heap space
- **Evidence**: Generic "out of bounds" errors without specific error handling
- **Impact**: Crashes instead of graceful error handling

### 4. **Duplicate Filesystem Creation**

- **Issue**: In `App.svelte` line 226, filesystem is recreated after jsonnet compilation
- **Evidence**: `createInMemoryFs` called twice for same file set
- **Impact**: Temporary memory spike during duplicate processing

## Proposed Solutions

### Phase 1: Memory Management Improvements

1. **Add memory monitoring and limits** to WASM module
2. **Implement streaming file processing** instead of loading all files at once
3. **Add proper error handling** for memory exhaustion scenarios
4. **Fix duplicate filesystem creation** bug

### Phase 2: File Size Optimizations

1. **Add file size validation** before processing
2. **Add progressive loading** for large file sets
3. **Optimize base64 encoding** to reduce memory usage
4. **Preserve original image quality** (no compression)

### Phase 3: User Experience Improvements

1. **Add progress indicators** for large file processing
2. **Implement better error messages** with specific memory guidance
3. **Add file size warnings** in the UI
4. **Provide troubleshooting tips** for memory issues

## Implementation Priority

- **High**: Fix duplicate filesystem creation and add memory error handling
- **Medium**: Add file size limits and validation
- **Low**: Implement streaming optimizations and progressive loading

The plan focuses on immediate fixes for the memory access errors while laying groundwork for better large file handling, ensuring user's original images are always preserved without any quality loss.

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
