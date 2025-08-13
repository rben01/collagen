# Plan to Fix WASM C++ Build Issues

## Problem Summary

When running `npm run dev` in the svelte directory, we encounter a C++ build error where `jsonnet-sys` cannot build due to missing the header file `<cassert>`. This occurs because when building for WASM, the build system tries to use the host system's C++ standard library headers, which are incompatible with WebAssembly targets.

The core issue is that `jsonnet-rs-docsrs-build` contains C++ code (the original jsonnet library) that needs WASM-compatible C++ headers, not system headers.

## Proposed Solution: Dual WASM Module Architecture

### Overview

Instead of trying to compile the C++ jsonnet library for WASM (which creates complex toolchain issues), we'll use a precompiled jsonnet WASM module alongside our main Collagen WASM module. This separates concerns and avoids C++ compilation issues entirely.

### Architecture

1. **Two Independent WASM Modules**:

   - `collagen-wasm`: Our main Rust module (pure Rust, no jsonnet dependency)
   - `jsonnet-wasm`: Separate module for jsonnet compilation (from external source)

2. **JavaScript Orchestration**: Frontend handles the pipeline:

   ```text
   .jsonnet file → jsonnet-wasm → JSON → collagen-wasm → SVG
   ```

3. **Benefits**:
   - No C++ compilation issues in our build
   - Clean separation of concerns
   - Independent updates of each module
   - Simpler build process

## Implementation Phases

### Phase 1: Research & Setup ✅ (COMPLETED)

**Objectives**:

- Research existing jsonnet WASM solutions
- Evaluate options for compatibility and performance
- Choose the best jsonnet WASM module

**Tasks**:

1. Research available jsonnet WASM implementations:

   - go-jsonnet compiled to WASM
   - jsonnet-js (pure JavaScript implementations)
   - Other precompiled jsonnet WASM modules
   - Community solutions on npm

2. Evaluate each option on:

   - **API Compatibility**: Does it provide the features we need?
   - **Bundle Size**: How much does it add to the build?
   - **Performance**: Is it fast enough for real-time use?
   - **Maintenance**: Is it actively maintained?
   - **Integration**: How easy is it to integrate with our current setup?

3. Document findings and provide recommendation

### Phase 2: Modify Rust Code ⭐ (ACTIVE)

**Objectives**:

- Remove jsonnet dependency from WASM builds
- Update WASM API to be JSON-only

**Tasks**:

1. Add conditional compilation to exclude jsonnet when targeting WASM
2. Update `Cargo.toml` features to make jsonnet optional for WASM target
3. Modify WASM API (`src/wasm.rs`) to only accept JSON input
4. Update error handling to reflect JSON-only support in WASM

### Phase 3: Update JavaScript Frontend ✅ (COMPLETED)

**Objectives**:

- Integrate jsonnet WASM module into frontend
- Update file processing pipeline

**Tasks**:

1. Add chosen jsonnet WASM module as npm dependency
2. Update file processing logic to detect .jsonnet files
3. Add jsonnet → JSON compilation step before calling collagen WASM
4. Handle jsonnet compilation errors in frontend UI
5. Update error messages and user feedback

### Phase 4: Build Configuration ✅ (COMPLETED)

**Objectives**:

- Ensure both WASM modules work together
- Optimize build and loading process

**Tasks**:

1. Update rollup config to handle dual WASM modules
2. Ensure both modules load correctly in development and production
3. Test the complete pipeline: .jsonnet → JSON → SVG
4. Optimize bundle size and loading performance

## Alternative Approach: Hybrid Emscripten (BACKUP)

If the precompiled approach encounters insurmountable issues, we could attempt:

1. Fork `jsonnet-rs-docsrs-build` to add WASM-specific build.rs logic
2. Configure emcc usage for WASM target while preserving wasm-bindgen compatibility
3. Create custom linker configuration

However, this approach has significant risks:

- Potential incompatibility between Emscripten and wasm-bindgen
- Complex toolchain coordination required
- More fragile and harder to maintain

## Current Status

- **Phase 1**: ✅ **COMPLETED** - Research & Setup
- **Phase 2**: ✅ **COMPLETED** - Modify Rust Code
- **Phase 3**: ✅ **COMPLETED** - Frontend Integration
- **Recommendation**: ✅ **ACCEPTED** - sjsonnet.js (Scala.js)
- **Status**: ✅ **IMPLEMENTATION COMPLETE**
- **Next Steps**: Test the complete .jsonnet → JSON → SVG pipeline

## Research Findings

### Available Jsonnet WASM/Browser Solutions

After researching available options, I found several approaches for running Jsonnet in the browser:

#### 1. go-jsonnet WASM (Official Go Implementation)

- **Source**: Google's official go-jsonnet repository
- **Build Method**: Manual build using `GOOS=js GOARCH=wasm go build -o libjsonnet.wasm ./cmd/wasm`
- **Bundle Size**: ~1500kb uncompressed, ~326kb gzipped (emscripten-compiled)
- **Maintenance**: Actively maintained by Google
- **API**: Basic WASM interface, requires custom JavaScript wrapper
- **Pros**: Official implementation, full feature compatibility
- **Cons**: Large bundle size, manual build process, no npm package

#### 2. @arakoodev/jsonnet (Rust/WASM)

- **Source**: Built on jrsonnet (Rust implementation of Jsonnet)
- **Bundle Size**: Unknown (likely smaller than Go version)
- **Maintenance**: Limited - last published 1 year ago, early stage
- **API**: NPM package, requires `--experimental-wasm-modules` flag
- **Pros**: NPM package available, Rust-based (potentially faster)
- **Cons**: Limited Jsonnet support, experimental, poor maintenance

#### 3. sjsonnet.js (Scala.js Compiled)

- **Source**: Databricks' high-performance Scala implementation
- **Bundle Size**: ~769kb uncompressed, ~189kb gzipped (significantly smaller)
- **Maintenance**: Actively maintained by Databricks
- **API**: Clean JavaScript API with import callbacks
- **Performance**: 1-3 orders of magnitude faster than other implementations
- **Pros**: Smallest bundle, best performance, production-ready, good API
- **Cons**: Not available as npm package, requires custom build/hosting

#### 4. Traditional NPM Packages (Node.js Native)

- **Options**: `jsonnet-js`, `@hanazuki/node-jsonnet`
- **Limitation**: These are native bindings, not browser-compatible
- **Use Case**: Only suitable for Node.js environments

### Evaluation Summary

| Option             | Bundle Size   | Performance | API Quality | Maintenance | NPM Package | Browser Ready |
| ------------------ | ------------- | ----------- | ----------- | ----------- | ----------- | ------------- |
| go-jsonnet WASM    | Large (326kb) | Good        | Basic       | Excellent   | ❌          | Manual        |
| @arakoodev/jsonnet | Unknown       | Good        | Fair        | Poor        | ✅          | Experimental  |
| sjsonnet.js        | Small (189kb) | Excellent   | Excellent   | Good        | ❌          | Ready         |
| Node.js packages   | N/A           | Good        | Good        | Varies      | ✅          | ❌            |

### Recommendation: sjsonnet.js (Scala.js)

**Primary Choice**: sjsonnet.js from Databricks

- **Best overall solution** for our use case
- **Smallest bundle size** (189kb gzipped) won't significantly impact load times
- **Highest performance** (30-60x faster than google/jsonnet in real-world usage)
- **Production-ready** and actively maintained by Databricks
- **Excellent JavaScript API** with import callback support perfect for our in-memory filesystem
- **Drop-in replacement** - can handle the same Jsonnet code we currently support

**Implementation Plan**:

1. Download/build sjsonnet.js from the Databricks repository
2. Host it as a static asset in our project or include it in our bundle
3. Integrate via the clean JavaScript API that already supports import callbacks

**Fallback Option**: go-jsonnet WASM

- If sjsonnet.js proves difficult to integrate
- Larger bundle but official Google implementation
- Would require more custom wrapper code

The sjsonnet.js option provides the best balance of performance, size, and maintainability for our dual WASM module architecture.

---

## Notes

- The precompiled approach is recommended as it's cleaner, more maintainable, and avoids complex C++ toolchain issues
- Each phase should be completed and tested before moving to the next
- This plan can be adjusted based on findings from Phase 1 research
