/**
 * Font tag tests for Collagen TypeScript implementation
 */

import { describe, it, expect } from "vitest";
import {
	generateSvgFromFileSystem,
	type InMemoryFileSystem,
} from "../index.js";
import { createTestFileSystem, TEST_FONT_WOFF2 } from "./test-utils.js";

/** Generate SVG wrapper for test execution */
async function generateSvgForTest(fs: InMemoryFileSystem): Promise<string> {
	return await generateSvgFromFileSystem(fs);
}

describe("Font Tag Tests", () => {
	it("should embed user-provided font", async () => {
		const fs = createTestFileSystem({
			"collagen.json": JSON.stringify({
				children: [
					{ fonts: [{ name: "CustomFont", path: "fonts/custom.woff2" }] },
				],
			}),
			"fonts/custom.woff2": TEST_FONT_WOFF2,
		});

		const svg = await generateSvgForTest(fs);

		expect(svg).toContain("<defs>");
		expect(svg).toContain("<style>");
		expect(svg).toContain("@font-face{");
		expect(svg).toContain("font-family:CustomFont;");
		expect(svg).toContain("data:font/woff2;charset=utf-8;base64,");
		expect(svg).toContain("</style>");
		expect(svg).toContain("</defs>");
	});

	it("should handle bundled fonts", async () => {
		const fs = createTestFileSystem({
			"collagen.json": JSON.stringify({
				children: [{ fonts: [{ name: "Impact", bundled: true }] }],
			}),
		});

		expect(await generateSvgForTest(fs)).toContain(
			"data:font/woff2;charset=utf-8;base64,d09GMgABAAAAAOSkABIAAAA",
		);
	});

	it("should handle font attributes", async () => {
		const fs = createTestFileSystem({
			"collagen.json": JSON.stringify({
				children: [
					{
						fonts: [
							{
								name: "CustomFont",
								path: "custom.woff2",
								attrs: {
									"font-weight": "bold",
									"font-style": "italic",
								},
							},
						],
					},
				],
			}),
			"custom.woff2": TEST_FONT_WOFF2,
		});

		const svg = await generateSvgForTest(fs);

		expect(svg).toContain("font-weight:bold;");
		expect(svg).toContain("font-style:italic;");
	});
});
