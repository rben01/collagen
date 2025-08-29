# Repository Guidelines

## Project Structure & Module Organization

- `src/`: Svelte UI (`App.svelte`, `FileUploader.svelte`, `SvgDisplay.svelte`)
  and TypeScript library under `src/lib/collagen-ts` (unit tests in
  `__tests__`).
- `tests/e2e/`: Playwright end-to-end tests and fixtures.
- `public/`: Static assets; Rollup outputs to `public/build/`.
- `rust/` (archival): Historical Rust crate. Do not reference, edit, build, or
  test.
- `assets/`, `schemas/`, `docs/`: Shared assets, JSON/JSONNet schemas,
  documentation.

## Build, Test, and Development Commands

- `npm run dev`: Start Rollup in watch mode and serve app on `:8080`.
- `npm run build`: Build Svelte/TS to `public/build/` (minified in production).
- `npm start`: Serve `public/` via `sirv`.
- `npm test` / `npm run test:run`: Vitest unit tests (headless, CI-friendly).
- `npm run test:ui`: Vitest UI runner.
- `npm run test:e2e` / `:ui` / `:debug`: Playwright tests (spins server via
  config).
- `npm run format` / `format:check`: Prettier write/check.
- Note: Rust is archival; do not run `cargo` commands.

## Coding Style & Naming Conventions

- Formatting: Prettier (tabs, width 3, semicolons, double quotes, trailing
  commas). Run `npm run format` before pushing.
- TypeScript: strict mode; use path aliases `@/*` and `@collagen/*` (see
  `tsconfig.json`).
- Files: Svelte components `PascalCase.svelte`; TS modules `kebab-case` or
  `index.ts` within folders.
- Rust: N/A — archival; do not edit.

## Testing Guidelines

- Unit: Vitest in `src/lib/collagen-ts/__tests__` named `*.test.ts`. Example:
  `npm test`.
- E2E: Playwright in `tests/e2e` (base URL `http://localhost:8080`). Example:
  `npm run test:e2e`.
- Rust: Do not add, run, or modify tests.

## Commit & Pull Request Guidelines

- Commits: Use Conventional Commits (e.g., `feat(ui): drag-and-drop uploader`,
  `fix(svg): escape text nodes`). Keep messages imperative and scoped.
- PRs: Include purpose, linked issue, and screenshots when relevant. Ensure
  `npm run format` and all JS tests (`vitest`, `playwright`) pass. Changes
  touching `rust/` are not accepted.

## Security & Configuration Tips

- Do not commit large binaries; place sample assets under `tests/examples`.
- Tooling versions: Node 18+.

## Archival Rust Code

- The `rust/` directory is retained for historical reference only.
- Do not reference it in features, documentation, or tests.
- Do not edit, format, build, or publish it under any circumstances.
