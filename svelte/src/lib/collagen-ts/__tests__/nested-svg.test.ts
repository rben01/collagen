/**
 * Nested SVG tests for Collagen TypeScript implementation
 */

import { describe, it, expect } from "vitest";
import {
	generateSvgFromFileSystem,
	type InMemoryFileSystem,
} from "../index.js";
import {
	createTestFileSystem,
	expectSvgEqual,
	TEST_SVG,
} from "./test-utils.js";

/** Generate SVG wrapper for test execution */
async function generateSvgForTest(fs: InMemoryFileSystem): Promise<string> {
	return await generateSvgFromFileSystem(fs);
}

describe("Nested SVG Tag Tests", () => {
	it("should include SVG file content", async () => {
		const fs = createTestFileSystem({
			"collagen.json": JSON.stringify({
				children: [
					{ svg_path: "icon.svg", attrs: { transform: "scale(2)" } },
				],
			}),
			"icon.svg": TEST_SVG,
		});

		const svg = await generateSvgForTest(fs);

		expect(svg).toContain('<g transform="scale(2)">');
		expect(svg).toContain('<circle cx="50" cy="50" r="25" fill="blue"/>');
		expect(svg).toContain("</g>");
	});

	it("should strip XML header from nested SVG", async () => {
		const svgWithHeader = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="10" y="10" width="80" height="80" fill="red"/>
</svg>`;

		const fs = createTestFileSystem({
			"collagen.json": JSON.stringify({
				children: [{ svg_path: "test.svg" }],
			}),
			"test.svg": svgWithHeader,
		});

		const svg = await generateSvgForTest(fs);

		// Should not contain XML declaration
		expect(svg).not.toContain("<?xml");
		expect(svg).toContain(
			'<rect x="10" y="10" width="80" height="80" fill="red"/>',
		);
	});
});
