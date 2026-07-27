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

/**
 * `random-gibberish` cannot be generated at all right now, so it has no
 * reproducible `out.svg` and is asserted separately below.
 */
const KNOWN_UNGENERATABLE = "random-gibberish";

const exampleNames = readdirSync(EXAMPLES_DIR, { withFileTypes: true })
	.filter(entry => entry.isDirectory())
	.map(entry => entry.name)
	.sort();

describe("tests/examples reference outputs", () => {
	it("finds the example directories", () => {
		expect(exampleNames.length).toBeGreaterThan(0);
	});

	for (const name of exampleNames) {
		if (name === KNOWN_UNGENERATABLE) continue;

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
 * Known regression, deliberately pinned rather than hidden.
 *
 * `createNestedContext()` in `../svg/index.js` builds a container's filesystem
 * by copying only the files beneath that container's own prefix. A nested
 * manifest therefore cannot resolve a Jsonnet import that reaches outside its
 * directory, and `random-gibberish` does exactly that — its
 * `assets/child_image/collagen.jsonnet` imports
 * `../../shared/shared.libjsonnet`.
 *
 * This used to work: the checked-in `out.svg` contains the interpolated result
 * `nested!! x=100 y=this_is_y`, which is only reachable by resolving that
 * import. So `out.svg` here is genuine pre-TypeScript output that current code
 * cannot reproduce — do not regenerate it, and do not treat its presence as
 * evidence the feature works.
 *
 * When container imports are fixed, this test will start failing. That is the
 * signal to delete it and let the example rejoin the loop above.
 */
describe("known regression: container-scoped Jsonnet imports", () => {
	it("random-gibberish still cannot resolve an import above its container", async () => {
		const exampleDir = join(EXAMPLES_DIR, KNOWN_UNGENERATABLE);
		const fs = await loadFromDisk(findSkeletonRoot(exampleDir));

		await expect(fs.generateSvg()).rejects.toThrow(
			/Failed to process container at \.\/assets\/child_image\//,
		);
	});
});
