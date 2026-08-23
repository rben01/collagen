/**
 * The layers tree, and the detach path it feeds.
 *
 * The tree's paths must be the same strings provenance records and SVG
 * generation stamps, or clicking a row selects the wrong element.
 */

import { describe, it, expect } from "vitest";
import { InMemoryFileSystem } from "../filesystem/index.js";
import {
	buildLayers,
	groupOf,
	nodeAtPath,
	splitPath,
	type LayerNode,
} from "../../components/editor/layers.js";
import { detachComprehension } from "../manifest/edit.js";
import type { JsonObject } from "../jsonnet/index.js";

async function analyze(source: string) {
	const fs = InMemoryFileSystem.createEmpty();
	fs.addFileContents("collagen.jsonnet", new TextEncoder().encode(source));
	const result = await fs.analyzeManifest();
	if (!result.ok) throw new Error(result.reason);
	return { fs, ...result };
}

/** Every node of a layers tree, flattened. */
function flatten(nodes: LayerNode[]): LayerNode[] {
	const out: LayerNode[] = [];
	for (const node of nodes) {
		out.push(node, ...flatten(node.children));
	}
	return out;
}

const LOOP_SOURCE = `{
	attrs: { viewBox: "0 0 400 300" },
	children: [
		{ tag: "rect", attrs: { x: 20, y: 20, width: 100, height: 50 } },
		{
			tag: "g",
			children: [
				{ tag: "circle", attrs: { cx: 60 + i * 90, cy: 200, r: 25 } }
				for i in std.range(0, 3)
			],
		},
	],
}`;

describe("buildLayers", () => {
	it("names each element after its tag", async () => {
		const { value, provenance } = await analyze(LOOP_SOURCE);
		const labels = flatten(buildLayers(value, provenance)).map(n => n.label);
		expect(labels).toEqual([
			"<rect>",
			"<g>",
			"<circle>",
			"<circle>",
			"<circle>",
			"<circle>",
		]);
	});

	it("marks every element a loop produced with the group size", async () => {
		const { value, provenance } = await analyze(LOOP_SOURCE);
		const nodes = flatten(buildLayers(value, provenance));

		expect(nodes.find(n => n.label === "<rect>")!.groupSize).toBe(1);
		for (const circle of nodes.filter(n => n.label === "<circle>")) {
			expect(circle.groupSize).toBe(4);
		}
	});

	it("uses the same paths the generated SVG is stamped with", async () => {
		const { fs, value, provenance } = await analyze(LOOP_SOURCE);
		const svg = await fs.generateSvg({ annotate: true });

		for (const node of flatten(buildLayers(value, provenance))) {
			expect(svg, node.path).toContain(`data-clgn-path="${node.path}"`);
		}
	});

	it("records each node's parent and index, for reordering", async () => {
		const { value, provenance } = await analyze(LOOP_SOURCE);
		const nodes = flatten(buildLayers(value, provenance));

		const group = nodes.find(n => n.label === "<g>")!;
		expect(group.parentPath).toBe("");
		expect(group.index).toBe(1);

		const circles = nodes.filter(n => n.label === "<circle>");
		expect(circles.map(c => c.index)).toEqual([0, 1, 2, 3]);
		expect(new Set(circles.map(c => c.parentPath))).toEqual(
			new Set(["children[1]"]),
		);
	});

	it("shows a text child as a row, even though it renders as bare text", async () => {
		const { value, provenance } = await analyze(
			'{ children: [{ tag: "text", children: "hello" }] }',
		);
		const labels = flatten(buildLayers(value, provenance)).map(n => n.label);
		expect(labels).toEqual(["<text>", '"hello"']);
	});
});

describe("groupOf", () => {
	it("returns every element sharing one source construct", async () => {
		const { value, provenance } = await analyze(LOOP_SOURCE);
		void value;
		expect(groupOf("children[1].children[0]", provenance).sort()).toEqual([
			"children[1].children[0]",
			"children[1].children[1]",
			"children[1].children[2]",
			"children[1].children[3]",
		]);
	});

	it("returns a lone element on its own", async () => {
		const { provenance } = await analyze(LOOP_SOURCE);
		expect(groupOf("children[0]", provenance)).toEqual(["children[0]"]);
	});
});

describe("nodeAtPath and splitPath", () => {
	it("resolves a nested path", async () => {
		const { value } = await analyze(LOOP_SOURCE);
		const node = nodeAtPath(value, "children[1].children[2]") as Record<
			string,
			JsonObject
		>;
		expect(node.tag).toBe("circle");
		expect((node.attrs as Record<string, JsonObject>).cx).toBe(240);
	});

	it("resolves the root to the whole manifest", async () => {
		const { value } = await analyze(LOOP_SOURCE);
		expect(nodeAtPath(value, "")).toBe(value);
	});

	it("returns null for a path that is not there", async () => {
		const { value } = await analyze(LOOP_SOURCE);
		expect(nodeAtPath(value, "children[9]")).toBeNull();
	});

	it("splits a path into its parent and index", () => {
		expect(splitPath("children[1].children[2]")).toEqual({
			parentPath: "children[1]",
			index: 2,
		});
		expect(splitPath("children[0]")).toEqual({ parentPath: "", index: 0 });
	});
});

describe("detaching a loop", () => {
	it("replaces the loop with the elements it produced", async () => {
		const { value, provenance } = await analyze(LOOP_SOURCE);
		const ref = provenance.sourceOf.get("children[1].children[0]")!;

		const values = [0, 1, 2, 3].map(
			i => nodeAtPath(value, `children[1].children[${i}]`)!,
		);
		const outcome = detachComprehension(LOOP_SOURCE, ref.braceFrom, values);
		if (!outcome.ok) throw new Error(outcome.reason);

		expect(outcome.source).not.toContain("for i in std.range");
		// The computed positions are baked down to the values they evaluated to.
		for (const cx of [60, 150, 240, 330]) {
			expect(outcome.source).toContain(`cx: ${cx}`);
		}

		// And the result still describes the same picture.
		const fs = InMemoryFileSystem.createEmpty();
		fs.addFileContents(
			"collagen.jsonnet",
			new TextEncoder().encode(outcome.source),
		);
		const after = await fs.analyzeManifest();
		if (!after.ok) throw new Error(after.reason);
		expect(after.value).toEqual(value);
	});

	it("bakes in no marker, because it expands the plain evaluation", async () => {
		const { value, provenance } = await analyze(LOOP_SOURCE);
		const ref = provenance.sourceOf.get("children[1].children[0]")!;
		const values = [0, 1, 2, 3].map(
			i => nodeAtPath(value, `children[1].children[${i}]`)!,
		);

		const outcome = detachComprehension(LOOP_SOURCE, ref.braceFrom, values);
		if (!outcome.ok) throw new Error(outcome.reason);
		expect(outcome.source).not.toContain("__clgn");
	});

	it("refuses when the elements come from shared code rather than a loop", async () => {
		const source = `
			local mk(c) = { tag: "rect", attrs: { fill: c } };
			{ children: [mk("red"), mk("blue")] }
		`;
		const { provenance } = await analyze(source);
		const ref = provenance.sourceOf.get("children[0]")!;

		const outcome = detachComprehension(source, ref.braceFrom, []);
		expect(outcome.ok).toBe(false);
		if (outcome.ok) return;
		expect(outcome.reason).toContain("shared code");
	});
});
