/**
 * Provenance: locating each rendered element in the manifest source.
 *
 * The load-bearing property is that two independent walks agree on every path
 * string -- the one that harvests markers out of the evaluated manifest, and
 * the one inside `generateSvg` that stamps `data-clgn-path`. If they ever drift
 * apart, hit-testing silently selects the wrong element, so several tests here
 * compare the two directly rather than checking either alone.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { InMemoryFileSystem } from "../filesystem/index.js";
import { firstParseError, parseManifest } from "../manifest/cst.js";
import {
	analyzeJson,
	analyzeJsonnet,
	instrument,
	stripMarkers,
} from "../manifest/provenance.js";

const LOOP_EXAMPLE =
	"tests/examples/drake-user-specified-font-loop/skeleton/collagen.jsonnet";

function fsWith(files: Record<string, string>): InMemoryFileSystem {
	const fs = InMemoryFileSystem.createEmpty();
	const encoder = new TextEncoder();
	for (const path in files) {
		fs.addFileContents(path, encoder.encode(files[path]));
	}
	return fs;
}

async function analyze(source: string) {
	return analyzeJsonnet(
		source,
		fsWith({ "collagen.jsonnet": source }),
		"collagen.jsonnet",
	);
}

/** Every `data-clgn-path` in a generated SVG, in document order. */
function pathsIn(svg: string): string[] {
	const found: string[] = [];
	const pattern = /data-clgn-path="([^"]*)"/g;
	let match;
	while ((match = pattern.exec(svg)) !== null) found.push(match[1]);
	return found;
}

describe("instrument", () => {
	it("marks a tag object once, at its opening brace", () => {
		const out = instrument('{ tag: "rect" }');
		expect(out).toBe('{ "__clgn_src": "0:0", tag: "rect" }');
	});

	it("leaves attrs objects alone, so no marker can reach an XML attribute", () => {
		const out = instrument('{ tag: "rect", attrs: { x: 1, fill: "red" } }');
		expect(out).toContain('attrs: { x: 1, fill: "red" }');
	});

	it("leaves font faces alone", () => {
		const out = instrument(
			'{ fonts: [{ name: "Impact", path: "./i.woff2" }] }',
		);
		expect(out).toContain('{ name: "Impact", path: "./i.woff2" }');
	});

	it("skips object comprehensions, which allow only one dynamic field", () => {
		const source = "{ tag: [k] for k in xs }";
		expect(instrument(source)).toBe(source);
	});

	it("shifts no line numbers", () => {
		const source = readFileSync(LOOP_EXAMPLE, "utf8");
		const lines = (text: string) => text.split("\n").length;
		expect(lines(instrument(source))).toBe(lines(source));
	});

	it("records offsets into the original text, not the instrumented text", () => {
		const source = '{ tag: "g", children: [{ tag: "rect" }] }';
		const instrumented = instrument(source);
		const markers = [...instrumented.matchAll(/"__clgn_src": "0:(\d+)"/g)];

		for (const [, offset] of markers) {
			expect(source[Number(offset)]).toBe("{");
		}
	});
});

describe("stripMarkers", () => {
	it("removes markers at every depth without mutating the input", () => {
		const input = {
			__clgn_src: "0:0",
			children: [{ __clgn_src: "0:9", tag: "rect" }],
		};
		expect(stripMarkers(input)).toEqual({ children: [{ tag: "rect" }] });
		expect(input.__clgn_src).toBe("0:0");
	});
});

describe("analyzeJsonnet", () => {
	it("groups the four tspans one loop produces", async () => {
		const source = readFileSync(LOOP_EXAMPLE, "utf8");
		const result = await analyze(source);
		if (!result.ok) throw new Error(result.reason);

		const { sourceOf, multiplicity } = result.provenance;
		const tspans = [0, 1, 2, 3].map(i =>
			sourceOf.get(`children[2].children[${i}]`),
		);

		// One source construct, four elements.
		expect(tspans.every(ref => ref !== undefined)).toBe(true);
		const offsets = new Set(tspans.map(ref => ref!.braceFrom));
		expect(offsets.size).toBe(1);

		const shared = `0:${tspans[0]!.braceFrom}`;
		expect(multiplicity.get(shared)).toBe(4);

		// The marker points at a real object literal in the source.
		expect(source[tspans[0]!.braceFrom]).toBe("{");
	});

	it("gives every statically written element a multiplicity of one", async () => {
		const source = readFileSync(LOOP_EXAMPLE, "utf8");
		const result = await analyze(source);
		if (!result.ok) throw new Error(result.reason);

		const { sourceOf, multiplicity } = result.provenance;
		for (const path of ["", "children[0]", "children[1]", "children[2]"]) {
			const ref = sourceOf.get(path);
			expect(ref, path).toBeDefined();
			expect(multiplicity.get(`0:${ref!.braceFrom}`), path).toBe(1);
		}
	});

	it("groups elements a shared constructor produced, with no loop involved", async () => {
		// The grouping test is marker multiplicity, not "came from a loop".
		const source = `
			local mk(c) = { tag: "rect", attrs: { fill: c } };
			{ children: [mk("red"), mk("blue")] }
		`;
		const result = await analyze(source);
		if (!result.ok) throw new Error(result.reason);

		const { sourceOf, multiplicity } = result.provenance;
		const first = sourceOf.get("children[0]")!;
		const second = sourceOf.get("children[1]")!;

		expect(first.braceFrom).toBe(second.braceFrom);
		expect(multiplicity.get(`0:${first.braceFrom}`)).toBe(2);
	});

	it("strips markers out of the value it returns", async () => {
		const result = await analyze('{ children: [{ tag: "rect" }] }');
		if (!result.ok) throw new Error(result.reason);
		expect(JSON.stringify(result.value)).not.toContain("__clgn_src");
	});
});

describe("analyzeJsonnet gates", () => {
	it("reports where a manifest stops parsing", () => {
		// The parse gate is defense in depth. The grammar and sjsonnet now agree
		// on every construct the suite in `jsonnet-grammar.test.ts` covers, so
		// nothing valid should reach it -- but a splice driven by offsets from a
		// mis-parsed tree lands in unrelated text, so the check stays.
		const tree = parseManifest("{ x: .5 }");
		expect(firstParseError(tree)).not.toBeNull();
		expect(firstParseError(parseManifest("{ x: 0.5 }"))).toBeNull();
	});

	it("lets a manifest that will not evaluate fail through the normal path", async () => {
		// sjsonnet's own message names the line and column, which beats any
		// generic thing this module could say.
		const source = "{ x: undefined_name }";
		const fs = fsWith({ "collagen.jsonnet": source });
		await expect(
			analyzeJsonnet(source, fs, "collagen.jsonnet"),
		).rejects.toThrow();
	});

	it("refuses a manifest that already uses the reserved key", async () => {
		const result = await analyze('{ __clgn_src: "mine", children: [] }');
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toContain("reserves");
	});

	it("refuses when the manifest enumerates an object the marker would join", async () => {
		const source = `
			local tag = { tag: "rect", attrs: {} };
			{ children: [tag], n: std.length(std.objectFields(tag)) }
		`;
		const result = await analyze(source);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toContain("enumerated or compared");
		// The render still works, which is what keeps the canvas alive.
		expect(result.value).toBeDefined();
	});

	it("refuses when the manifest compares two objects for equality", async () => {
		const source = `
			local a = { tag: "rect" };
			local b = { tag: "rect" };
			{ children: [a], same: a == b }
		`;
		const result = await analyze(source);
		expect(result.ok).toBe(false);
	});
});

describe("analyzeJson", () => {
	it("locates elements with no instrumentation at all", () => {
		const source = JSON.stringify(
			{ attrs: { viewBox: "0 0 10 10" }, children: [{ tag: "rect" }] },
			null,
			2,
		);
		const result = analyzeJson(source);
		if (!result.ok) throw new Error(result.reason);

		const ref = result.provenance.sourceOf.get("children[0]")!;
		expect(source[ref.braceFrom]).toBe("{");
		expect(source.slice(ref.braceFrom)).toContain('"tag"');
	});

	it("treats a lone child object as a one-element array, as validation does", () => {
		const source = '{"children": {"tag": "rect"}}';
		const result = analyzeJson(source);
		if (!result.ok) throw new Error(result.reason);
		expect(result.provenance.sourceOf.has("children[0]")).toBe(true);
	});
});

describe("paths agree with what generateSvg stamps", () => {
	it("matches on the loop example", async () => {
		const source = readFileSync(LOOP_EXAMPLE, "utf8");
		const fs = InMemoryFileSystem.createEmpty();
		fs.addFileContents("collagen.jsonnet", new TextEncoder().encode(source));
		fs.addFileContents("drake-small.jpg", new Uint8Array([1, 2, 3]));
		fs.addFileContents("impact.woff2", new Uint8Array([4, 5, 6]));

		const result = await fs.analyzeManifest();
		if (!result.ok) throw new Error(result.reason);

		const svg = await fs.generateSvg({ annotate: true });
		const stamped = pathsIn(svg);

		// Every path the generator stamps must be one provenance knows about.
		for (const path of stamped) {
			expect(result.provenance.sourceOf.has(path), path).toBe(true);
		}
		// And every element provenance found must have been stamped.
		for (const path of result.provenance.sourceOf.keys()) {
			expect(stamped, path).toContain(path);
		}
	});

	it("stamps nothing unless asked", async () => {
		const source = '{ children: [{ tag: "rect" }] }';
		const fs = fsWith({ "collagen.jsonnet": source });
		expect(await fs.generateSvg()).not.toContain("data-clgn");
	});

	it("cannot be shadowed by a manifest that sets the attribute itself", async () => {
		const source =
			'{ children: [{ tag: "rect", attrs: { "data-clgn-path": "lies" } }] }';
		const fs = fsWith({ "collagen.jsonnet": source });
		const svg = await fs.generateSvg({ annotate: true });
		expect(svg).toContain('data-clgn-path="children[0]"');
		expect(svg).not.toContain("lies");
	});
});
