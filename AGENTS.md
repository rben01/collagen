# Repository Guidelines

## Project Structure & Module Organization

- `src/`: SvelteKit app shell and routes. Key files:
  - `src/app.html` (app template), `src/global.css` (global styles)
  - Routes under `src/routes/` (e.g., `+page.svelte`, `+page.ts`)
  - UI files used by the page (e.g., `FileUploader.svelte`, `SvgDisplay.svelte`)
  - TypeScript library under `src/lib/collagen-ts` (unit tests in `__tests__`)
- `static/`: Public/static assets copied verbatim to the build.
- `build/`: Static output from SvelteKit (`@sveltejs/adapter-static`).
- `tests/e2e/`: Playwright end-to-end tests and fixtures.
- `rust/` (archival): Historical Rust crate. Do not reference, edit, build, or test.
- `assets/`, `schemas/`, `docs/`: Shared assets, JSON/JSONNet schemas, documentation.

## Build, Test, and Development Commands

- `npm run dev`: Start SvelteKit (Vite) dev server. Default port `:5173`.
- `npm run build`: Build SvelteKit app to `build/` (adapter-static, minified).
- `npm run preview`: Serve the built app locally (tests use `:8080`).
- `npm test`: Run unit tests (Vitest) and then E2E tests (Playwright).
- `npm run test:unit`: Vitest unit tests; add `-- --run` for headless CI.
- `npm run test:unit:ui`: Vitest UI runner.
- `npm run test:e2e` / `:ui` / `:debug`: Playwright tests (builds then previews on port `8080`).
- `npm run format`: Prettier write.
- `npm run lint`: Prettier check + ESLint.
- Note: Rust is archival; do not run `cargo` commands.

## Coding Style & Naming Conventions

- Formatting: Prettier (tabs, width 3, semicolons, double quotes, trailing commas). Run `npm run format` before pushing.
- Linting: ESLint (flat config `eslint.config.js`) with strict TS/Svelte rules.
- TypeScript: strict mode; primary path aliases: `@/*` and `$lib/*` (see `vitest.config.ts` and `tsconfig.json`).
- Files: Svelte components `PascalCase.svelte`; SvelteKit routes `+page.svelte`/`+layout.svelte`; TS modules `kebab-case` or `index.ts` within folders.
- Rust: N/A — archival; do not edit.

## Testing Guidelines

- Unit: Vitest in `src/lib/collagen-ts/__tests__` named `*.test.ts`. Examples: `npm run test:unit -- --run` or `npm test`.
- E2E: Playwright in `tests/e2e`. Uses `npm run build && npm run preview -- --port 8080`; base URL `http://localhost:8080`. Example: `npm run test:e2e`.
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
