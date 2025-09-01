# Gemini Code Assistant Context

## Project Overview

This is a SvelteKit project for "Collagen", a tool that generates SVG collages
from a JSON or Jsonnet manifest file. The project includes the frontend
application, which likely provides a user interface for creating and editing
these collages, as well as the underlying tooling. The `readme.adoc` file
provides extensive documentation on the `clgn` command-line tool, which is the
core of the Collagen project.

The frontend is built with Svelte and Vite. The project is configured for static
site generation, as indicated by `@sveltejs/adapter-static` in
`svelte.config.js`.

## Building and Running

- **Development:** `npm run dev`
- **Build:** `npm run build`
- **Preview:** `npm run preview`
- **Testing:**
  - **Unit Tests:** `npm run test:unit`
  - **End-to-End Tests:** `npm run test:e2e`
  - **All Tests:** `npm test`
- **Linting:** `npm run lint`
- **Formatting:** `npm run format`

## Development Conventions

- **Testing:** The project uses Vitest for unit testing and Playwright for
  end-to-end testing. Tests are located in the `src/lib/collagen-ts/__tests__`
  and `tests/e2e` directories, respectively.
- **Code Style:** The project uses Prettier for code formatting and ESLint for
  linting. Configuration files for these tools are present in the root
  directory.
- **Languages:** The project uses TypeScript and Svelte.
