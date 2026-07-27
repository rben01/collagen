# Repository Guidelines

Guidance for coding agents. This file deliberately does **not** catalogue the
file tree, module APIs, or data flow — read the code for those. It covers only
what reading the code won't tell you: conventions, and things that will bite
you.

## Project Overview

Collagen turns a JSON/Jsonnet manifest plus assets into a single SVG with
everything embedded. Three surfaces share one core library
(`src/lib/collagen-ts/`): a SvelteKit web app, a `clgn` CLI (`src/cli/`,
published to npm as `@rben01/collagen`), and the test suites.

See @readme.adoc for why the project exists and what problems it solves — useful
when weighing feature or UI decisions.

The project is entirely TypeScript. An earlier Rust implementation was removed;
any surviving reference to a `rust/` directory, a Cargo manifest, or
`docs.rs/collagen` is stale and should be fixed.

## Commands

See @package.json for the full list.

```bash
npm run check                  # svelte-check + sveltekit sync
npm run test:unit:run          # vitest, once
npm run test:e2e:run:chromium  # playwright, chromium only (much faster)
npm run build:cli              # bundle src/cli/ -> dist/cli.js
```

Never type `npx` yourself; always go through `npm run ...`. (Some scripts use
`npx` internally — `test:e2e` runs `npx playwright install`. That's fine.)

`test:unit:run` is already `vitest run`, so don't pass `--run`:

```bash
npm run test:unit:run -- src/lib/collagen-ts/__tests__/basic.test.ts
npm run test:unit:run -- -t "validates basic root tag structure"
```

E2E needs **two** `--`: the first escapes the npm script, the second reaches
`playwright test`:

```bash
npm run test:e2e:run -- -- --project=chromium -g "loads a skeleton"
```

## Conventions

### Layout

- Only route files (`+page.svelte`, `+layout.*`) live in `src/routes/`. Every
  component lives in `src/lib/components/`, imported via `$lib/components/...`.
- `prerender = true` is set once in `src/routes/+layout.ts` and covers the whole
  app. Don't add a `+page.ts` for it.
- Import with explicit `.js` extensions, for ESM compatibility.
- Buttons should use `ControlButton.svelte` unless there's a reason not to. If
  unsure, ask which the user wants.

### Svelte 5

Use runes: `$props()`, `$state()`, `$derived()`/`$derived.by()`, `$effect()`,
and `onclick`-style handlers (never `on:click`).

- **Never** use `$effect()` to attach an event listener where `onevent` works.
  - Bad: `$effect(() => { elem.addEventListener('click', f) })`
  - Good: `<div onclick={f}></div>`, or `<div {onclick}></div>` when the
    function name matches the property.
- Prefer built-in reactivity over change/input handlers.
  - Bad: `<input bind:value={foo} oninput={handleOnInput} />`
  - Good: `<input bind:value={foo} />` plus `$effect(() => { /* react */ })`

### Performance

Avoid allocating throwaway arrays:

- `for...of` instead of chained `.map(...).filter(...)`
- `for...in` instead of `Object.entries`/`Object.fromEntries`
- `Array.from({length: n}, (_, i) => f(i))` to build an array of length `n`

### Other

- Paths always use forward slashes; the filesystem layer normalizes them.
- Throw the typed error classes in `src/lib/collagen-ts/errors/`.
- Comments should explain surprising behavior, non-obvious intent, or why an
  alternative was rejected. Never write a comment that just narrates a change.

## Things that will bite you

**Links must be resolved.** The site is served under `/collagen` on GitHub
Pages, so no path may be hardcoded. Use `$app/paths` — `base` is deprecated:

- Internal links: `href={resolve("/docs", {})}`. `resolve()` demands a params
  object even for routes with no params; omitting it is a type error.
- `static/` files: `src={asset("/tutorial/smiley.jpg")}`.

The `svelte/no-navigation-without-resolve` lint rule enforces this.

**`tests/examples/*/out.svg` is not verified by anything.** Vitest only collects
`src/lib/collagen-ts/**`, and no test loads those fixtures from disk. They have
drifted from real output — they still carry the pre-TypeScript `image/jpg` MIME
type where the generator now emits `image/jpeg`. Treat them as illustrative, and
never conclude a change is safe because they still match. Unit tests assert
against expected SVG strings written inline in the test files.

**Some files are vendored or generated — don't hand-edit.**

- `jsonnet/sjsonnet.js` is pre-compiled third-party output from
  [sjsonnet](https://github.com/databricks/sjsonnet); it is eslint-ignored.
- `jsonnet/jsonnet-parser*.js` is generated from `jsonnet.grammar`.
- `jsonnet-stdlib-completions.ts` is derived by
  `jsonnet/docs/parse-jsonnet-docs.js`.

**Target viewers by `aria-label`, not by CSS selector, in tests.** `SvgDisplay`
and `ImageDisplay` both wrap the shared `ViewerCore`, whose interactive element
is labelled `"Interactive SVG viewer"` / `"Interactive image viewer"`; the
transformed inner element is `"Viewer content"`. Reuse the zoom/pan math in
`src/lib/components/viewer/index.ts` rather than writing new geometry.

**The `/docs` tutorial's code samples are real, runnable Jsonnet.** The `// (n)`
callout markers are ordinary comments so snippets stay copy-pasteable — if you
edit one, run it through `clgn` to confirm it still compiles. Its rendered
output in `static/tutorial/` is generated from `tests/examples/` fixtures:

```bash
npm run build:cli && node dist/cli.js -i <skeleton> -o static/tutorial/<name>.svg
```

**Ignore `@opentelemetry/api` errors.** Don't even mention them.

## Adding a tag type

Four places must stay in sync:

1. `types/index.ts` — add to the `AnyChildTag` union. Discriminating keys must
   not overlap with existing tags, or detection becomes ambiguous.
2. `validation/index.ts` — validation logic.
3. `svg/index.ts` — SVG generation.
4. `schemas/SCHEMA.md` — the user-facing schema reference.
