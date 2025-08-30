# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

Collagen is primarily a TypeScript/Svelte web application that generates SVG
collages from JSON/Jsonnet manifest files. The project consists of:

- **Primary implementation**: TypeScript library in `src/lib/collagen-ts/` with
  full Collagen functionality
- **Web frontend**: Svelte application providing drag-and-drop interface for
  creating SVG collages
- **Backup implementation**: Rust crate in `rust/` directory (legacy, not
  actively used)
- **Comprehensive test suite**: Unit tests (Vitest) and E2E tests (Playwright)

### Project rationale

- Refer to @readme.adoc for a rationale of why this project is useful — what
  problems it attempts to solve and what use cases exist. This may help to come
  up with additional features or drive UI development.

## Common Commands

### Building and Testing

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Run unit tests
npm run test

# Run tests in watch mode (interactive)
npm run test:ui

# Run tests once and exit
npm run test:run

# Run E2E tests
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui

# Debug E2E tests
npm run test:e2e:debug

# Format code
npm run format

# Check formatting
npm run format:check
```

### Running Individual Tests

```bash
# Run specific test file
npm run test src/lib/collagen-ts/__tests__/basic.test.ts

# Run tests matching pattern
npm run test -- --run filesystem

# Run single test by name
npm run test -- --run -t "validates basic root tag structure"
```

## Architecture

### TypeScript Core Modules (`src/lib/collagen-ts/`)

- **`index.ts`**: Main API providing `generateSvgFromObject()` and other entry
  points
- **`filesystem/`**: File system abstraction and path utilities
- **`types/`**: TypeScript definitions for all SVG tag types and document
  structure
- **`validation/`**: Schema validation and type checking for manifest documents
- **`svg/`**: SVG generation from typed document structure
- **`jsonnet/`**: Jsonnet compilation using sjsonnet WASM library
- **`utils/`**: Common utilities (base64, XML escaping, etc.)
- **`errors/`**: Error types and handling

### Key Types

- **`RootTag`**: Root SVG document structure with attributes and children
- **`AnyChildTag`**: Union type of all possible SVG child elements (text, image,
  container, etc.)
- **`InMemoryFileSystem`**: File system abstraction for browser File objects
- **`ManifestFormat`**: Either "json" or "jsonnet" for manifest file detection

### Data Flow

1. Files uploaded via browser file picker or drag-and-drop
2. `InMemoryFileSystem.create()` converts File objects to `InMemoryFileSystem`
3. `loadManifest()` detects and parses JSON or Jsonnet manifest
4. `validateDocument()` validates and creates typed `RootTag` structure
5. `generateSvg()` recursively builds SVG with embedded assets (base64-encoded
   images/fonts)

## Development Notes

### Tag System

The TypeScript implementation uses discriminated unions for tag types. When
adding new tag types:

- Add the type to the `AnyChildTag` union in
  `src/lib/collagen-ts/types/index.ts`
- Ensure discriminating properties don't overlap with existing tags to avoid
  ambiguity
- Add validation logic in `src/lib/collagen-ts/validation/index.ts`
- Add SVG generation logic in `src/lib/collagen-ts/svg/index.ts`

### File System Abstraction

The `InMemoryFileSystem` class provides browser-compatible file access:

- Handles both individual files and directories from drag-and-drop
- Normalizes paths using forward slashes across platforms
- Provides utilities for detecting file types (images, fonts) by extension

### Test Structure

- **`src/lib/collagen-ts/__tests__/`**: Unit tests using Vitest
- **`tests/e2e/`**: End-to-end tests using Playwright
- **`tests/examples/`**: Reference test cases with skeleton folders and expected
  SVG outputs
- Each test example has a `skeleton/` folder with manifest and assets, plus
  `out.svg` for validation
- Tests verify that generated SVG matches expected output
  character-for-character

#### Playwright Element Selection

When using Playwright to look for elements, prefer in this order:

1. `page.getByLabel()` - Most accessible, uses aria-label or associated labels
2. `page.getByRole()` - Semantic roles like button, textbox, etc.
3. `page.locator()` - Least preferred, use only when necessary for CSS selectors

### Manifest Formats

- **JSON**: `collagen.json` - Standard JSON format
- **Jsonnet**: `collagen.jsonnet` - Preferred when both exist, provides
  variables, functions, loops, and imports
- The TypeScript implementation uses sjsonnet.js (WASM-compiled jsonnet) for
  client-side evaluation

### Code Style

- **TypeScript**: Strict mode enabled with comprehensive linting
- **Performance**: Avoid creating temporary arrays; use `for...of` loops instead
  of chained `array.map(...).filter(...)`
- **Path handling**: Always use forward slashes (`/`) in paths, normalized by
  the filesystem layer
- **Imports**: Use explicit `.js` extensions for ESM compatibility
- **Error handling**: Use typed error classes from `src/lib/collagen-ts/errors/`

## Frontend Architecture

### Core Components (`src/`)

- **`App.svelte`**: Main application component orchestrating file upload and SVG
  generation
- **`FileUploader.svelte`**: Drag-and-drop file upload component with folder
  support
- **`SvgDisplay.svelte`**: Interactive SVG viewer with zoom, pan, and export
  functionality
- **`main.js`**: Application entry point using Svelte 5's `mount()` API

### Key Features

- **Folder Upload**: Supports drag-and-drop of entire project folders and
  browser folder picker
- **Real-time Processing**: Files are processed immediately after upload using
  pure TypeScript
- **Interactive Viewer**: Generated SVGs can be zoomed, panned, and exported
- **Error Handling**: Comprehensive error display with typed error messages
- **Manifest Detection**: Automatically detects and prefers `collagen.jsonnet`
  over `collagen.json`
- **Client-side Jsonnet**: Uses sjsonnet.js WASM library for Jsonnet compilation
  in browser

### Data Flow

1. **File Collection**: `FileUploader` handles drag-and-drop and folder
   selection
2. **TypeScript Processing**: Files are passed to `generateSvgFromObject()` from
   the TypeScript library
3. **In-Memory FS**: Browser File objects are converted to `InMemoryFileSystem`
4. **Processing**: Pure TypeScript implementation processes manifest and assets
5. **Display**: Generated SVG is rendered in `SvgDisplay` with interactive
   controls

### Browser Compatibility

- Uses modern browser APIs: `File`, `FileReader`, `drag-and-drop`,
  `webkitdirectory`
- Jsonnet support via sjsonnet.js WASM (pre-compiled, included in bundle)
- No server-side processing required - fully client-side application
- Works in all modern browsers with ES2020+ support

## Legacy Rust Implementation

The `rust/` directory contains the original Rust implementation which served as
the reference for the TypeScript port. This implementation:

- Is not actively used but maintained for reference
- Contains the same test examples in `rust/tests/examples/`
- Uses the original CLI interface (`cargo run -- -i skeleton -o output.svg`)
- Does not support WebAssembly compilation (removed)
