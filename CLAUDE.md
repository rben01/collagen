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

### Data Flow

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
