/**
 * Reference-fixture tests for `tests/examples`
 *
 * Each example directory holds a skeleton plus the `out.svg` it is expected to
 * produce. These tests load each skeleton from disk through the same
 * `loadFromDisk` helper the CLI uses and assert the generated SVG matches the
 * checked-in file byte for byte.
 *
 * Without this, the `out.svg` files are inert: nothing else reads them, so they
 * can drift from real output indefinitely.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadFromDisk } from "../../../cli/disk-loader.js";

// Not `import.meta.url` — under vitest's jsdom transform that is an http: URL,
// so fileURLToPath() rejects it. vitest roots at the project directory.
const EXAMPLES_DIR = resolve(process.cwd(), "tests/examples");

const MANIFESTS = ["collagen.jsonnet", "collagen.json"];

function hasManifest(dir: string): boolean {
	for (const name of MANIFESTS) {
		if (existsSync(join(dir, name))) return true;
	}
	return false;
}

/**
 * The skeleton is usually `<example>/skeleton`, but not always — `simple-nesting`
 * roots its at `A`. Fall back to whichever immediate subdirectory holds a
 * manifest.
 */
function findSkeletonRoot(exampleDir: string): string {
	const conventional = join(exampleDir, "skeleton");
	if (hasManifest(conventional)) return conventional;

	for (const entry of readdirSync(exampleDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const candidate = join(exampleDir, entry.name);
		if (hasManifest(candidate)) return candidate;
	}

	throw new Error(`No skeleton with a manifest found under ${exampleDir}`);
}

const exampleNames = readdirSync(EXAMPLES_DIR, { withFileTypes: true })
	.filter(entry => entry.isDirectory())
	.map(entry => entry.name)
	.sort();

describe("tests/examples reference outputs", () => {
	it("finds the example directories", () => {
		expect(exampleNames.length).toBeGreaterThan(0);
	});

	for (const name of exampleNames) {
		it(`${name} regenerates its checked-in out.svg exactly`, async () => {
			const exampleDir = join(EXAMPLES_DIR, name);
			const fs = await loadFromDisk(findSkeletonRoot(exampleDir));

			const actual = await fs.generateSvg();
			const expected = await readFile(join(exampleDir, "out.svg"), "utf-8");

			expect(actual).toBe(expected);
		});
	}
});

/**
 * Regression guard: a nested skeleton must be able to import a file that lives
 * above its own directory. `random-gibberish`'s
 * `assets/child_image/collagen.jsonnet` imports `../../shared/shared.libjsonnet`
 * and interpolates a value from it, which only succeeds if the container's
 * Jsonnet imports resolve against the shared filesystem rather than a copy
 * sandboxed to the container.
 */
describe("container-scoped Jsonnet imports", () => {
	it("resolves an import that reaches above the container", async () => {
		const exampleDir = join(EXAMPLES_DIR, "random-gibberish");
		const fs = await loadFromDisk(findSkeletonRoot(exampleDir));

		const svg = await fs.generateSvg();

		// x comes from the shared library, y from the nested manifest itself
		expect(svg).toContain("nested!! x=100 y=this_is_y");
	});
});
