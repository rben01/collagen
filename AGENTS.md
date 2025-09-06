# Repository Guidelines

This file provides guidance to Coding agents when working with code in this
repository.

## Project Overview

Collagen is primarily a TypeScript/SvelteKit web application that generates SVG
collages from JSON/Jsonnet manifest files. The project consists of:

- **Primary implementation**: TypeScript library in `src/lib/collagen-ts/` with
  full Collagen functionality
- **Web frontend**: SvelteKit application with Vite providing drag-and-drop
  interface for creating SVG collages
- **Comprehensive test suite**: Unit tests (Vitest) and E2E tests (Playwright)
- **Archive**: Rust crate in `rust/` directory (legacy, not actively used, and
  you should NEVER read these files unless explicitly asked to)

### Project rationale

- Refer to @readme.adoc for a rationale of why this project is useful — what
  problems it attempts to solve and what use cases exist. This may help to come
  up with additional features or drive UI development.

## Common Commands

### Building and Testing

Refer to @package.json for a list of npm commands. The main ones you'll need
are:

```bash
# Type checking and SvelteKit sync
npm run check

# Run unit tests once and exit
npm run test:unit:run

# Run e2e tests in chromium once and exit (faster because it tests fewer browsers)
npm run test:e2e:run:chromium
```

You must NEVER run an `npx` command. Only ever run `npm run ...`.

### Running Individual Tests

```bash
# Run specific test file
npm run test:unit:run -- src/lib/collagen-ts/__tests__/basic.test.ts

# Run tests matching pattern
npm run test:unit:run -- --run filesystem

# Run single unit test by name
npm run test:unit:run -- --run -t "validates basic root tag structure"

# Run single e2e test by name
npm run test:e2e:run -- --project chromium -g "validates basic root tag structure"
```

## Architecture

### TypeScript Core Modules (`src/lib/collagen-ts/`)

- **`index.ts`**: Main API providing re-exports and general error type
- **`filesystem/index.ts`**: File system abstraction with `InMemoryFileSystem`
  class for browser File objects, path normalization utilities, and manifest
  detection
- **`types/index.ts`**: TypeScript definitions for all SVG tag types (`RootTag`,
  `AnyChildTag`, `ImageTag`, etc.) using discriminated unions
- **`validation/index.ts`**: Schema validation and type checking for manifest
  documents, converting untyped objects to typed structures
- **`svg/index.ts`**: SVG generation from typed document structure with
  recursive tag processing and asset embedding
- **`jsonnet/index.ts`**: Jsonnet compilation integration with sjsonnet.js,
  providing `compileJsonnet()` function with filesystem callbacks
  - **`jsonnet/sjsonnet.js`**: Pre-compiled sjsonnet JavaScript library
    (Scala.js output) for client-side Jsonnet evaluation
  - **`jsonnet/sjsonnet.d.ts`**: TypeScript definitions for sjsonnet.js API
- **`utils/index.ts`**: Common utilities (base64 encoding/decoding, XML
  escaping, object type checking)
- **`errors/index.ts`**: Typed error classes (`MissingFileError`,
  `JsonnetError`, `ValidationError`, etc.)

### Key Types

- **`RootTag`**: Root SVG document structure with attributes and children
- **`AnyChildTag`**: Union type of all possible SVG child elements (text, image,
  container, etc.)
- **`InMemoryFileSystem`**: File system abstraction for browser File objects
- **`ManifestFormat`**: Either "json" or "jsonnet" for manifest file detection

### Data Flow

1. Files uploaded via browser file picker or drag-and-drop
2. `InMemoryFileSystem.create()` converts File objects to `InMemoryFileSystem`
   1. `fs.loadManifestContents()` detects and loads JSON or Jsonnet manifest
      file
   2. `fs.generateUntypedObject()` parses JSON or compiles Jsonnet using
      sjsonnet.js
   3. `fs.generateSvg()` recursively builds SVG with embedded assets
      (base64-encoded images/fonts)
3. `validateDocument()` validates untyped object (output of
   `fs.generateUntypedObject()`) and creates typed `RootTag`

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
- Normalizes paths in the following way:
  - Uses forward slashes across platforms
  - Removes redundant path separators, including leading and trailing slashes
- Provides utilities for detecting file types (images, fonts) by extension

### Jsonnet Integration with sjsonnet.js

The TypeScript implementation uses **sjsonnet.js** for client-side Jsonnet
compilation. This is a pre-compiled JavaScript file available for download from
[sjsonnet](https://github.com/databricks/sjsonnet):

- **`sjsonnet.js`**: Pre-compiled JavaScript library with no dependencies
- **`sjsonnet.d.ts`**: TypeScript definitions for the sjsonnet API
- **Integration**: The `compileJsonnet()` function in `jsonnet/index.ts`
  provides a bridge between Collagen's file system and sjsonnet's compilation

#### How sjsonnet.js Works

1. **No Build Step**: sjsonnet.js is included as a regular JavaScript file
2. **File Resolution**: Collagen provides resolver and loader callbacks to
   sjsonnet for handling `import` statements
3. **Path Normalization**: All paths are normalized through Collagen's
   `normalizedPathJoin()` before being passed to sjsonnet
4. sjsonnet allows the user to provide configuration, but we do not use this
   feature
5. **Error Handling**: sjsonnet compilation errors are caught and wrapped in
   Collagen's `JsonnetError` class

#### Example Usage

```typescript
import { compileJsonnet } from "./jsonnet/index.js";
import { InMemoryFileSystem } from "./filesystem/index.js";

const result = compileJsonnet(
  jsonnetCode,
  filesystem, // InMemoryFileSystem instance
  manifestPath, // For error reporting
);
```

The resolver callback handles import paths, turning them into strings that are
the resolved path. The loader callback takes these resolved paths and reads file
contents from the in-memory file system, enabling Jsonnet files to import other
Jsonnet files.

### Test Structure

- **`src/lib/collagen-ts/__tests__/`**: Unit tests using Vitest
- **`tests/e2e/`**: End-to-end tests using Playwright
- **`tests/examples/`**: Reference test cases with skeleton folders and expected
  SVG outputs
- Each test example has a `skeleton/` folder with manifest and assets, plus
  `out.svg` for validation
- Tests verify that generated SVG matches expected output
  character-for-character

### SvelteKit Development

The project uses SvelteKit with static site generation:

- **Route-based architecture**: Pages are defined in `src/routes/` following
  SvelteKit conventions
- **Static prerendering**: Pages are pre-rendered at build time using
  `export const prerender = true` in `+page.ts`
- **Import aliases**: Use `$lib/` for imports from `src/lib/` (e.g.,
  `import { foo } from '$lib/collagen-ts/index.js'`)
- **Vite configuration**: Build optimizations in `vite.config.ts` including
  exclusion of sjsonnet.js from optimization
- **Type checking**: Use `npm run check` for SvelteKit-aware TypeScript checking

### Svelte 5 Syntax

Components use modern Svelte 5 runes:

- **Props**: Use `let { prop1, prop2 } = $props<{ prop1: Type; prop2: Type }>()`
  instead of `export let`
- **State**: Use `let value = $state(initialValue)` instead of regular `let` for
  reactive state
- **Derived**: Use `$derived()` for computed values
- **Effects**: Use `$effect()` for side effects

### Manifest Formats

- **JSON**: `collagen.json` - Standard JSON format
- **Jsonnet**: `collagen.jsonnet` - Preferred when both exist; provides
  variables, functions, loops, and imports
  - The TypeScript implementation uses sjsonnet.js for client-side evaluation

### Code Style

- **TypeScript**: Strict mode enabled with comprehensive ESLint 9+ linting
- **SvelteKit conventions**:
  - Use `$lib/` import aliases for `src/lib/` (e.g.,
    `import { foo } from '$lib/collagen-ts/index.js'`)
  - Follow SvelteKit file-based routing (`+page.svelte`, `+page.ts`,
    `+layout.svelte`, etc.)
  - Use `export const prerender = true` for static page generation
- **Svelte 5 syntax**:
  - Use `$props<{ ... }>()` instead of `export let` for component props
  - Use `$state()` for reactive state variables
  - Use `$derived()` for computed values
  - Use `$effect()` for side effects
- **Performance**: Avoid creating temporary arrays:
  - Use `for...of` loops instead of chained `array.map(...).filter(...)`
  - Use `for...in` loops instead of `Object.entries` or `Object.fromEntries`
  - To create an array of length `n` from a function, use
    `Array.from({length: n}, (_, index => func(index)))`
- **Path handling**: Always use forward slashes (`/`) in paths, normalized by
  the filesystem layer
- **Imports**: Use explicit `.js` extensions for ESM compatibility
- **Error handling**: Use typed error classes from `src/lib/collagen-ts/errors/`

## Frontend Architecture

### Core Components

- **`src/routes/+page.svelte`**: Main application page component orchestrating
  file upload and SVG generation (SvelteKit route)
- **`src/routes/+page.ts`**: Page configuration with static prerendering enabled
- **`src/routes/FileUploader.svelte`**: Drag-and-drop file upload component with
  folder support
  - Supports both drag and drop, and a file picker via a hidden `<input>`
  - Drag and drop exposes a different `File` API than the `<input>`; dragged and
    dropped files (and folders) have a `webkitGetAsEntry()` that offers richer
    features than a simple `File` object, including recursive traversal of
    dropped folders.
  - Uses Svelte 5 runes (`$props`, `$state`) for reactive state management
- **`src/routes/SvgDisplay.svelte`**: Interactive SVG viewer with zoom, pan, and
  export functionality
  - Element hierarchy: `div.svg-display` contains `button.svg-container`
    contains `div.svg-content` contains the generated `<svg></svg>`.
  - It is the `button.svg-container` that's interactive and responds to user
    gestures, keyboard keys, etc.
  - It is the `div.svg-content` that has a transform applied to it when the user
    interacts with the SVG.
  - Reminder: in tests, refer to these by their `aria-label`, not their
    selector!
- **`src/app.html`**: SvelteKit HTML template with placeholders
  (`%sveltekit.assets%`, `%sveltekit.head%`, `%sveltekit.body%`)
- **`src/global.css`**: Global CSS styles for the application

### Key Features

- **Static Site Generation**: Built with SvelteKit using
  `@sveltejs/adapter-static` for static deployment
- **Modern Build System**: Vite-powered development and build process with Hot
  Module Replacement (HMR)
- **Folder Upload**: Supports drag-and-drop of entire project folders and
  browser folder picker
- **Real-time Processing**: Files are processed immediately after upload using
  pure TypeScript
- **Interactive Viewer**: Generated SVGs can be zoomed, panned, and exported
- **Error Handling**: Comprehensive error display with typed error messages
- **Manifest Detection**: Automatically detects and prefers `collagen.jsonnet`
  over `collagen.json`
- **Client-side Jsonnet**: Uses sjsonnet.js for Jsonnet compilation in browser
  - Source: <https://github.com/databricks/sjsonnet>

### Data Flow

1. **SvelteKit Route Loading**: `+page.svelte` loads as the main route with
   static prerendering
2. **File Collection**: `FileUploader` component handles drag-and-drop and
   folder selection
3. **File System Creation**: Browser File objects are converted to
   `InMemoryFileSystem` via `InMemoryFileSystem.create()`
4. **Manifest Processing**: `fs.loadManifestContents()` detects manifest format
   and loads content; Jsonnet files are compiled using sjsonnet.js
5. **Validation**: `validateDocument()` converts untyped objects to typed
   `RootTag` structures
6. **SVG Generation**: `fs.generateSvg()` recursively builds SVG with embedded
   base64-encoded assets
7. **Display**: Generated SVG is rendered in `SvgDisplay` component with
   interactive controls

### Browser Compatibility

- Uses modern browser APIs: `File`, `FileReader`, `drag-and-drop`,
  `webkitdirectory`
- Jsonnet support via sjsonnet.js, which is included as a regular JS file
- No server-side processing required - fully client-side application with
  SvelteKit static adapter
- Works in all modern browsers with ES2020+ support
- Vite optimizes bundle for modern browsers with automatic polyfill detection
