# Repository Guidelines

This file provides guidance to Coding agents when working with code in this
repository.

## Project Overview

Collagen is primarily a TypeScript/SvelteKit web application that generates SVG
collages from JSON/Jsonnet manifest files. The project consists of:

- **Core library**: TypeScript library in `src/lib/collagen-ts/` with full
  Collagen functionality
- **Web frontend**: SvelteKit application with Vite providing drag-and-drop
  interface for creating SVG collages
- **CLI**: `src/cli/`, bundled by esbuild into the `clgn` executable published
  to npm as `@rben01/collagen`
- **Comprehensive test suite**: Unit tests (Vitest) and E2E tests (Playwright)

The project is entirely TypeScript. An earlier Rust implementation existed but
has been removed; if you find a reference to a `rust/` directory, a Cargo
manifest, or `docs.rs/collagen` in the docs, it is stale and should be fixed.

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

Never invoke `npx` directly; always go through `npm run ...`. (Some npm scripts
do use `npx` internally — `test:e2e` runs `npx playwright install` to make sure
browsers are present. That is fine; the rule is about what _you_ type.)

To build the CLI:

```bash
# Bundle src/cli/ into dist/cli.js via esbuild
npm run build:cli
```

### Running Individual Tests

`test:unit:run` is already `vitest run`, so there is no need to pass `--run`.

```bash
# Run specific test file
npm run test:unit:run -- src/lib/collagen-ts/__tests__/basic.test.ts

# Run tests matching pattern
npm run test:unit:run -- filesystem

# Run single unit test by name
npm run test:unit:run -- -t "validates basic root tag structure"

# Run single e2e test by name. Note the two `--`: the first passes args through
# the `test:e2e:run` script, the second through to `playwright test`.
npm run test:e2e:run -- -- --project=chromium -g "loads a skeleton"
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
- **`filesystem/upload.ts`**: File upload processing, including recursive
  drag-and-drop folder traversal and the `FileUploadError` type
- **`jsonnet/index.ts`**: Jsonnet compilation integration with sjsonnet.js,
  providing `compileJsonnet()` function with filesystem callbacks
  - **`jsonnet/sjsonnet.js`**: Pre-compiled, large (even when minified) sjsonnet
    JavaScript library for client-side Jsonnet evaluation
  - **`jsonnet/sjsonnet.d.ts`**: TypeScript definitions for sjsonnet.js API
- **`utils/index.ts`**: Common utilities (base64 encoding/decoding, XML
  escaping, object type checking)
- **`errors/index.ts`**: Typed error classes (`MissingFileError`,
  `JsonnetError`, `ValidationError`, etc.)

#### Jsonnet Editor Tooling (`src/lib/collagen-ts/jsonnet/`)

Separate from compilation, these power syntax highlighting and completion in the
in-app CodeMirror editor:

- **`jsonnet.grammar`**: Lezer grammar for Jsonnet
- **`jsonnet-parser.js`** / **`jsonnet-parser.terms.js`** / **`.d.ts`**:
  Generated Lezer parser. Regenerate from the grammar rather than hand-editing.
- **`cm-jsonnet-highlight.ts`**: CodeMirror language/highlight integration
- **`jsonnet-stdlib-completions.ts`**: Autocomplete data for the Jsonnet stdlib
- **`src/lib/collagen-ts/jsonnet/docs/parse-jsonnet-docs.js`**: Script that
  derives the completion data

### CLI (`src/cli/`)

- **`index.ts`**: `commander` entry point defining the `clgn` interface:
  required `-i/--input` and `-o/--out-file` (`-` for stdout), plus optional
  `-f/--format`, `--watch`, and `--debounce`
- **`run.ts`**: `runOnce()` and `runWatch()` (watch mode uses `chokidar`)
- **`disk-loader.ts`**: Node filesystem loader that backs `InMemoryFileSystem`
  with real files on disk, mirroring what the browser does with `File` objects

### Additional Library Assets

- **`src/lib/fonts/`**: Bundled font files (e.g., Impact font)

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
- **`tests/examples/`**: Skeleton folders with manifests and assets, each
  alongside an `out.svg`
- Unit tests assert against expected SVG strings written inline in the test
  files, and compare them character-for-character.
- Caveat: **nothing currently reads the `out.svg` files.** Vitest only collects
  `src/lib/collagen-ts/**`, and no test loads these fixtures from disk, so the
  checked-in `out.svg`s are unverified reference data that has drifted from
  current output (e.g. they still carry the pre-TypeScript `image/jpg` MIME
  type, where the generator now emits `image/jpeg`). Treat them as illustrative,
  not authoritative, and do not assume a change is safe because they still
  match.

### SvelteKit Development

The project uses SvelteKit with Svelte 5 and static site generation:

- **Route-based architecture**: Pages are defined in `src/routes/` following
  SvelteKit conventions. Reusable components live in `src/lib/components/`, not
  alongside the routes.
- **Static prerendering**: `export const prerender = true` is set once in
  `src/routes/+layout.ts`, which covers the whole app. There is no `+page.ts`.
- **Import aliases**: Use `$lib/` for imports from `src/lib/` (e.g.,
  `import { foo } from '$lib/collagen-ts/index.js'`)
- **Vite configuration**: Build optimizations in `vite.config.ts` including
  exclusion of sjsonnet.js from optimization
- **Type checking**: Use `npm run check` for SvelteKit-aware TypeScript checking

### Svelte 5 Syntax

Components use modern Svelte 5 runes:

- **Props**: Use `let { prop1, prop2 } = $props<{ prop1: Type; prop2: Type }>()`
  instead of `export let`
- **State**: Use `let value = $state(initialValue)` instead of regular `let` or
  `$: let` for reactive state
- **Derived**: Use `$derived(expr)` for computed values, or `$derived.by(func)`
  for more complex derived values
- **Effects**: Use `$effect()` for side effects
- **Event handlers**: Use `onEVENT` not `on:EVENT`, e.g. `onclick` not
  `on:click`.

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
    - NEVER use `$effect()` to add event listeners when the syntax `onevent`
      will work. ONLY use `$effect()` to add event listeners as a last resort.
      - Bad: `$effect(() => { elem.addEventListener('click', f) })`
      - Good: `<div onclick={f}></div>`, or `<div {onclick}></div>` if the
        function has the same name as the on-event property.
  - Prefer using Svelte's built-in reactivity to using input or change handlers
    or similar.
    - Bad: `<input bind:value={foo} oninput={handleOnInput} />`
    - Good: `<input bind:value={foo} />` with
      `$effect(() => { /* handle change to foo */ })`
- **Performance**: Avoid creating temporary arrays:
  - Use `for...of` loops instead of chained `array.map(...).filter(...)`
  - Use `for...in` loops instead of `Object.entries` or `Object.fromEntries`
  - To create an array of length `n` from a function, use
    `Array.from({length: n}, (_, index => func(index)))`
- **Path handling**: Always use forward slashes (`/`) in paths, normalized by
  the filesystem layer
- **Imports**: Use explicit `.js` extensions for ESM compatibility
- **Error handling**: Use typed error classes from `src/lib/collagen-ts/errors/`
- **Comments**: Never use comments merely to comment on changes you've made.
  Comments should only be used to indicate surprising behavior, clarify code
  whose purpose is not self-evident, indicate the pitfalls of going with a
  different solution, or otherwise annotate code that is not self-documenting.

### Other

- You can safely ignore errors referencing `@opentelemetry/api`. You should not
  even mention such errors.

## Frontend Architecture

Only route files live in `src/routes/`. Every component lives in
`src/lib/components/` and is imported via the `$lib/components/...` alias.

### Routes

- **`src/routes/+page.svelte`**: Main application page, orchestrating file
  upload, manifest editing, and SVG generation
- **`src/routes/docs/+page.svelte`**: The "Up and Running With Collagen"
  tutorial, served at `/docs`. Prerenders to a static page like the editor.
  - Its example manifests live in `const` template literals and are real,
    runnable Jsonnet — the `// (n)` callout markers are ordinary comments, so
    the snippets stay copy-pasteable. If you edit one, re-run it through `clgn`
    to confirm it still compiles.
  - Rendered example output lives in `static/tutorial/` and is generated from
    the fixtures in `tests/examples/` with
    `npm run build:cli && node dist/cli.js -i <skeleton> -o static/tutorial/<name>.svg`.
- **`src/routes/+layout.svelte`**: Root layout component
- **`src/routes/+layout.ts`**: Sets `prerender = true` for the whole app

The site is served under `/collagen` on GitHub Pages, so paths must never be
hardcoded. Use `$app/paths`, not the deprecated `base`:

- Internal links: `href={resolve("/docs", {})}`. `resolve()` wants a params
  object even for routes that have no params — omitting it is a type error.
- Files in `static/`: `src={asset("/tutorial/smiley.jpg")}`.

The `svelte/no-navigation-without-resolve` lint rule enforces this.

### Viewer Components

The SVG viewer and the image viewer share one interaction engine.

- **`src/lib/components/ViewerCore.svelte`**: The shared, interactive
  zoom/pan/keyboard surface. Both viewers wrap it, passing content in via a
  snippet.
  - Element hierarchy: `button.viewer-container` contains
    `div.viewer-content-mask` contains `div.viewer-content` contains
    `div.viewer-media` contains the rendered content.
  - It is the `button.viewer-container` that's interactive and responds to user
    gestures, keyboard keys, etc. It takes its accessible name from the
    `ariaLabel` prop, so it is `"Interactive SVG viewer"` under `SvgDisplay` and
    `"Interactive image viewer"` under `ImageDisplay`.
  - It is the `div.viewer-content` that has the transform applied when the user
    zooms or pans. It carries `role="img"` and `aria-label="Viewer content"`.
  - Exposes an imperative API to its parent: `focus()`, `hasFocus()`,
    `zoomIn()`, `zoomOut()`, `resetView()`, `cycleBackgroundStyle()`, `pan()`.
  - Reminder: in tests, refer to these by their `aria-label`, not their
    selector!
- **`src/lib/components/viewer/index.ts`**: Pure helpers and constants behind
  the viewer — `MIN_SCALE`/`MAX_SCALE`, `BACKGROUND_STYLES`, `clampScale()`,
  `calculateZoomToPoint()`, `calculateConstrainedDimensions()`,
  `getViewerKeyAction()`, `isTypingInInput()`. Prefer reusing these over writing
  new zoom/pan math.
- **`src/lib/components/viewer/viewer.css`**: Shared viewer styles
- **`src/lib/components/SvgDisplay.svelte`**: SVG viewer — wraps `ViewerCore`
  and adds a toolbar plus copy/download and preview-vs-code toggling
- **`src/lib/components/ImageDisplay.svelte`**: Image viewer for previewing an
  uploaded image, wrapping the same `ViewerCore`

### UI Components

- **`src/lib/components/FileUploader.svelte`**: Drag-and-drop file upload with
  folder support
  - Supports both drag and drop, and a file picker via a hidden `<input>`
  - Drag and drop exposes a different `File` API than the `<input>`; dragged and
    dropped files (and folders) have a `webkitGetAsEntry()` that offers richer
    features than a simple `File` object, including recursive traversal of
    dropped folders.
- **`src/lib/components/FileList.svelte`**: Displays and manages uploaded files
- **`src/lib/components/TextEditor.svelte`**: CodeMirror-based editor for
  manifest files, with Jsonnet highlighting and stdlib completion
- **`src/lib/components/RightPane.svelte`**: Container for the right side of the
  UI
- **`src/lib/components/IntroPane.svelte`**: Welcome/introduction panel
- **`src/lib/components/LoadingPane.svelte`**: Loading state display
- **`src/lib/components/ErrorPane.svelte`**: Error message display for manifest
  and generation errors
- **`src/lib/components/UploadErrorPane.svelte`**: Separate display for
  `FileUploadError`s raised while collecting files
- **`src/lib/components/ToastContainer.svelte`**: Transient toast notifications;
  also exports the `Toast` type
- **`src/lib/components/Toolbar.svelte`**: Reusable toolbar component
- **`src/lib/components/ControlButton.svelte`**: Reusable button component
  - Unless otherwise stated, buttons should be created using this component. If
    unsure, ask the user whether they want a ControlButton or a different kind
    of button.
- **`src/lib/components/ButtonIcon.svelte`**: Icon component for buttons
- **`src/lib/components/ButtonIcon.ts`**: TypeScript utilities for button icons
- **`src/lib/components/CodeBlock.svelte`**: Static code sample with an optional
  filename header and numbered callouts, used by the `/docs` tutorial. This is
  deliberately plain `<pre><code>`, not CodeMirror — it needs no editing or
  highlighting and must prerender.

### Helper Modules

- **`src/lib/collagen-ts/filesystem/upload.ts`**: File upload processing,
  including drag-and-drop folder handling
- **`src/app.html`**: SvelteKit HTML template with placeholders
  (`%sveltekit.assets%`, `%sveltekit.head%`, `%sveltekit.body%`)
- **`src/app.css`**: Global CSS styles for the application

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

### Loading and SVG Generation Flow

1. **SvelteKit Route Loading**: `+page.svelte` loads as the main route, with
   static prerendering configured in `+layout.ts`
2. **File Collection**: `FileUploader` component handles drag-and-drop and
   folder selection using `collagen-ts/filesystem/upload.ts` utilities
3. **File System Creation**: Browser File objects are converted to
   `InMemoryFileSystem` via `InMemoryFileSystem.create()`
4. **Manifest Processing**: `fs.loadManifestContents()` detects manifest format
   and loads content; Jsonnet files are compiled using sjsonnet.js
5. **Validation**: `validateDocument()` converts untyped objects to typed
   `RootTag` structures
6. **SVG Generation**: `fs.generateSvg()` recursively builds SVG with embedded
   base64-encoded assets
7. **Display**: Generated SVG is rendered in the `SvgDisplay` component (which
   wraps `ViewerCore` for zoom/pan) with interactive controls, while UI state is
   managed through various pane components (`IntroPane`, `LoadingPane`,
   `ErrorPane`, `UploadErrorPane`, etc.)

### Browser Compatibility

- Uses modern browser APIs: `File`, `FileReader`, `drag-and-drop`,
  `webkitdirectory`
- Jsonnet support via sjsonnet.js, which is included as a regular JS file
- No server-side processing required - fully client-side application with
  SvelteKit static adapter
- Works in all modern browsers with ES2020+ support
- Vite optimizes bundle for modern browsers with automatic polyfill detection
