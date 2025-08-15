/**
 * Container tag tests for Collagen TypeScript implementation
 */

import { describe, it, expect } from "vitest";
import {
	generateSvgFromFileSystem,
	type InMemoryFileSystem,
} from "../index.js";
import { createTestFileSystem, expectSvgEqual } from "./test-utils.js";

/** Generate SVG wrapper for test execution */
async function generateSvgForTest(fs: InMemoryFileSystem): Promise<string> {
	return await generateSvgFromFileSystem(fs);
}

describe("Container Tag Tests", () => {
	it("should include nested folder contents", async () => {
		const fs = createTestFileSystem({
			"collagen.json": JSON.stringify({
				attrs: { viewBox: "0 0 100 100" },
				children: [
					{
						tag: "g",
						attrs: { transform: "translate(10,10)" },
						children: [{ clgn_path: "subfolder" }],
					},
				],
			}),
			"subfolder/collagen.json": JSON.stringify({
				attrs: { class: "nested" },
				children: [
					{
						tag: "circle",
						attrs: { cx: 25, cy: 25, r: 20, fill: "blue" },
					},
				],
			}),
		});

		const svg = await generateSvgForTest(fs);

		expect(svg).toContain('viewBox="0 0 100 100"');
		expect(svg).toContain('transform="translate(10,10)"');
		expect(svg).toContain('<g class="nested">');
		expect(svg).toContain('<circle cx="25" cy="25" r="20" fill="blue"/>');
	});

	it("should handle deeply nested containers", async () => {
		const fs = createTestFileSystem({
			"collagen.json": JSON.stringify({
				children: [{ clgn_path: "level1" }],
			}),
			"level1/collagen.json": JSON.stringify({
				children: [{ clgn_path: "level2" }],
			}),
			"level1/level2/collagen.json": JSON.stringify({
				children: [{ text: "Deep nested content" }],
			}),
		});

		const svg = await generateSvgForTest(fs);

		expect(svg).toContain("Deep nested content");
	});
});
