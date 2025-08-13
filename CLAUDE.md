# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Collagen is a Rust-based CLI tool that generates SVG collages from JSON/Jsonnet manifest files. The project consists of:

- Main Rust crate (`collagen`) that produces the `clgn` executable
- Svelte web frontend in the `svelte/` directory
- Comprehensive test suite with visual examples

### Project rationale

- Refer to @readme.adoc for a rationale of why this project is useful — what problems it
  attempts to solve and what use cases exist. This may help to come up with additional
  features or drive UI development.

## Common Commands

- Try to use absolute paths for commands instead of relative paths, as when you use
  relative paths you tend to get lost (since you don't know which directory you're
  currently in).

### Building and Testing

```bash
# Build the main Rust project
cargo build

# Build in release mode
cargo build --release

# Run all tests
cargo test

# Run a specific test
cargo test test_name

# Check code without building
cargo check
```

### Svelte Frontend (in svelte/ directory)

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start
```

**Note for testing**: When testing whether the frontend will build correctly (especially WASM compilation), use `npm run build` instead of `npm run dev`. This avoids waiting for the dev server to launch and then timeout, making testing much faster.

### Running Collagen

```bash
# Basic usage
cargo run -- -i path/to/skeleton -o output.svg

# With watch mode
cargo run -- -i path/to/skeleton -o output.svg --watch
```

## Architecture

### Core Modules

- **`cli/`**: Command-line interface and file system abstractions (disk-backed and in-memory)
- **`fibroblast/`**: Core data structures representing the in-memory SVG structure
  - **`tags/`**: SVG element types (text, image, container, etc.)
  - **`data_types/`**: Value types and decoding context
- **`from_json/`**: JSON/Jsonnet deserialization and validation
- **`to_svg/`**: SVG output generation
- **`assets/`**: Embedded font handling
- **`utils/`**: Common utilities

### Key Types

- **`Fibroblast`**: Main struct containing the root SVG tag and decoding context
- **`AnyChildTag`**: Enum of all possible SVG child elements (uses serde's `untagged`)
- **`DecodingContext`**: Context for resolving file paths and resources
- **`ProvidedInput`**: Abstraction over disk-based or in-memory file systems

### Data Flow in Backend

1. CLI parses input folder/file and creates `ProvidedInput`
2. `Fibroblast::new()` loads and deserializes manifest (JSON/Jsonnet)
3. Tags are resolved with their context (images base64-encoded, paths resolved)
4. `to_svg()` writes the final SVG output

## Development Notes

### Tag System

When adding new tag types to `AnyChildTag`, ensure the required fields don't overlap with existing tags to avoid deserialization ambiguity. The system uses serde's `untagged` approach.

### File System Abstraction

The codebase supports both disk-backed and in-memory file systems for testing. The `InMemoryFs` type allows testing without actual files.

### Test Structure

- **`tests/examples/`**: Visual test cases with skeleton folders and expected SVG outputs
- Each test case has a `skeleton/` folder with manifest and assets, plus `out.svg` for comparison
- Tests verify that generated SVG exactly matches expected output

### Manifest Formats

- JSON: `collagen.json`
- Jsonnet: `collagen.jsonnet` (preferred if both exist)
  - Jsonnet provides variables, functions, loops, and imports for complex layouts, which
    makes it more flexible than JSON

### Code Style

- Uses hard tabs (configured in `rustfmt.toml`)
- Clippy pedantic warnings enabled with specific allows
- Imports organized at crate level (`imports_granularity = "Crate"`)
- Use descriptive variable and function names

## Frontend-Backend Integration

### WASM Connection Architecture

The project includes a web frontend that runs Collagen entirely in the browser via WebAssembly (WASM):

#### Build Process

- **Main Rust Crate**: The core `collagen` library includes a `wasm` feature that exposes WASM bindings in `src/wasm.rs`
- **WASM Wrapper Crate**: A separate `collagen-wasm` crate in `svelte/Cargo.toml` re-exports the main crate's WASM functionality
- **Rollup Integration**: `@wasm-tool/rollup-plugin-rust` plugin automatically compiles Rust to WASM during frontend builds
- **Runtime Loading**: The frontend dynamically imports the WASM module via `import("../Cargo.toml")`

#### WASM API Surface

The WASM module exposes these key functions (defined in `src/wasm.rs`):

- `createInMemoryFs(files_map)` - Converts uploaded files to in-memory filesystem
- `generateSvg(fs_handle, format)` - Processes manifest and generates SVG output
- `validateManifest(content, format)` - Validates JSON/Jsonnet manifest syntax
- `getSupportedFormats()` - Returns supported manifest formats

#### Data Flow

1. **File Upload**: Browser files are collected into a JavaScript `Map<string, File>`
2. **WASM Conversion**: Files are converted to Rust's `InMemoryFs` via `createInMemoryFs()`
3. **Processing**: Same core logic as CLI version processes manifest and assets
4. **SVG Output**: Generated SVG is returned as string to JavaScript

### Frontend Architecture

#### Core Components (`svelte/src/`)

- **`App.svelte`**: Main application component that orchestrates file upload and SVG generation
- **`FileUploader.svelte`**: Drag-and-drop file upload component with folder support
- **`SvgDisplay.svelte`**: Interactive SVG viewer with zoom, pan, and export functionality
- **`main.js`**: Application entry point using Svelte 5's `mount()` API

#### Key Features

- **Folder Upload**: Supports drag-and-drop of entire project folders and browser folder picker
- **Real-time Processing**: Files are processed immediately after upload
- **Interactive Viewer**: Generated SVGs can be zoomed, panned, and exported
- **Error Handling**: Comprehensive error display for WASM loading and processing failures
- **Manifest Detection**: Automatically detects and prefers `collagen.jsonnet` over `collagen.json`

#### Data Flow in Frontend

1. **File Collection**: `FileUploader` handles drag-and-drop and folder selection
2. **WASM Integration**: Files are passed to WASM module via `handleFilesUploaded()` in `App.svelte`
3. **In-Memory FS**: JavaScript files are converted to Rust `InMemoryFs` structure
4. **Processing**: Core Collagen logic runs entirely in browser (same as CLI)
5. **Display**: Generated SVG is rendered in `SvgDisplay` with interactive controls

#### Browser Compatibility

- Uses modern browser APIs: `File`, `FileReader`, `drag-and-drop`, `webkitdirectory`
- WASM module requires browsers with WebAssembly support (all modern browsers)
- No server-side processing required - fully client-side application
