/**
 * Container tag tests for Collagen TypeScript implementation
 */

import { describe, it, expect } from "vitest";
import { createFileSystem } from "./test-utils.js";

describe("Container Tag Tests", () => {
	it("should include nested folder contents", async () => {
		const fs = await createFileSystem({
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

		const svg = await fs.generateSvg();

		expect(svg).toContain('viewBox="0 0 100 100"');
		expect(svg).toContain('transform="translate(10,10)"');
		expect(svg).toContain('<g class="nested">');
		expect(svg).toContain('<circle cx="25" cy="25" r="20" fill="blue"/>');
	});

	it("should handle deeply nested containers", async () => {
		const fs = await createFileSystem({
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

		const svg = await fs.generateSvg();

		expect(svg).toContain("Deep nested content");
	});
});
