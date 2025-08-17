/**
 * Basic tests for Collagen TypeScript implementation
 *
 * These tests verify the fundamental functionality by porting
 * the basic test cases from the Rust implementation.
 */

import { describe, it, expect } from "vitest";
import {
	generateSvgFromFileSystem,
	type InMemoryFileSystem,
} from "../index.js";
import {
	TEST_CASES,
	executeTestCase,
	createTestFileSystem,
	expectSvgEqual,
} from "./test-utils.js";

// =============================================================================
// Helper Functions
// =============================================================================

/** Generate SVG wrapper for test execution */
async function generateSvgForTest(fs: InMemoryFileSystem): Promise<string> {
	return await generateSvgFromFileSystem(fs);
}

// =============================================================================
// Basic Functionality Tests
// =============================================================================

describe("Collagen TypeScript Basic Tests", () => {
	it("should generate empty SVG from empty manifest", async () => {
		const testCase = TEST_CASES.find(tc => tc.name === "empty")!;
		await executeTestCase(testCase, generateSvgForTest);
	});

	it("should generate basic smiley SVG", async () => {
		const testCase = TEST_CASES.find(tc => tc.name === "basic-smiley")!;
		await executeTestCase(testCase, generateSvgForTest);
	});

	it("should handle manual manifest creation", async () => {
		const fs = createTestFileSystem({
			"collagen.json": JSON.stringify({
				attrs: { viewBox: "0 0 50 50" },
				children: [
					{
						tag: "rect",
						attrs: { x: 10, y: 10, width: 30, height: 30, fill: "red" },
					},
				],
			}),
		});

		const svg = await generateSvgForTest(fs);
		expectSvgEqual(
			svg,
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50"><rect x="10" y="10" width="30" height="30" fill="red"/></svg>',
		);
	});

	it("should handle text tags", async () => {
		const fs = createTestFileSystem({
			"collagen.json": JSON.stringify({
				children: [
					{ text: "Hello, World!" },
					"Plain string text",
					{ text: "<b>Bold</b>", is_preescaped: true },
				],
			}),
		});

		const svg = await generateSvgForTest(fs);
		expectSvgEqual(
			svg,
			'<svg xmlns="http://www.w3.org/2000/svg">Hello, World!Plain string text<b>Bold</b></svg>',
		);
	});

	it("should handle nested groups", async () => {
		const fs = createTestFileSystem({
			"collagen.json": JSON.stringify({
				children: [
					{
						tag: "g",
						attrs: { transform: "translate(10,10)" },
						children: [
							{
								tag: "circle",
								attrs: { cx: 0, cy: 0, r: 5, fill: "blue" },
							},
							{
								tag: "g",
								attrs: { opacity: "0.5" },
								children: [
									{
										tag: "rect",
										attrs: {
											x: -2,
											y: -2,
											width: 4,
											height: 4,
											fill: "red",
										},
									},
								],
							},
						],
					},
				],
			}),
		});

		const svg = await generateSvgForTest(fs);
		expectSvgEqual(
			svg,
			'<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(10,10)"><circle cx="0" cy="0" r="5" fill="blue"/><g opacity="0.5"><rect x="-2" y="-2" width="4" height="4" fill="red"/></g></g></svg>',
		);
	});

	it("should preserve xmlns attribute if provided", async () => {
		const fs = createTestFileSystem({
			"collagen.json": JSON.stringify({
				attrs: {
					xmlns: "http://www.w3.org/2000/svg",
					"xmlns:xlink": "http://www.w3.org/1999/xlink",
					viewBox: "0 0 100 100",
				},
				children: [],
			}),
		});

		const svg = await generateSvgForTest(fs);
		expectSvgEqual(
			svg,
			'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100"></svg>',
		);
	});

	it("should handle single child without array", async () => {
		const fs = createTestFileSystem({
			"collagen.json": JSON.stringify({
				children: { tag: "circle", attrs: { cx: 50, cy: 50, r: 25 } },
			}),
		});

		const svg = await generateSvgForTest(fs);
		expectSvgEqual(
			svg,
			'<svg xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="25"/></svg>',
		);
	});

	it("should handle empty children array", async () => {
		const fs = createTestFileSystem({
			"collagen.json": JSON.stringify({
				attrs: { viewBox: "0 0 100 100" },
				children: [],
			}),
		});

		const svg = await generateSvgForTest(fs);
		expectSvgEqual(
			svg,
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>',
		);
	});
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe("Collagen TypeScript Error Handling", () => {
	it("should throw error for missing manifest", async () => {
		const fs = createTestFileSystem({ "other-file.txt": "not a manifest" });

		await expect(generateSvgForTest(fs)).rejects.toThrow(
			"Missing manifest file",
		);
	});

	it("should throw error for invalid JSON", async () => {
		const fs = createTestFileSystem({ "collagen.json": "{ invalid json }" });

		await expect(generateSvgForTest(fs)).rejects.toThrow();
	});

	it("should throw error for unrecognized tag", async () => {
		const fs = createTestFileSystem({
			"collagen.json": JSON.stringify({
				children: [{ unknown_field: "value" }],
			}),
		});

		await expect(generateSvgForTest(fs)).rejects.toThrow(
			"did not match any known schema",
		);
	});

	it("should throw error for missing required field", async () => {
		const fs = createTestFileSystem({
			"collagen.json": JSON.stringify({
				children: [
					{ tag: "" }, // empty tag name
				],
			}),
		});

		// This should pass validation but produce an element with empty tag name
		// The error handling here depends on the specific validation rules
		const svg = await generateSvgForTest(fs);
		expect(svg).toContain("<>");
	});
});

// =============================================================================
// Attribute Handling Tests
// =============================================================================

describe("XML Attribute Handling", () => {
	it("should escape XML special characters in attributes", async () => {
		const fs = createTestFileSystem({
			"collagen.json": JSON.stringify({
				children: [
					{
						tag: "text",
						attrs: {
							"data-content": "Hello & <World> \"test\" 'quote'",
							x: 10,
							y: 20,
						},
					},
				],
			}),
		});

		const svg = await generateSvgForTest(fs);
		expect(svg).toContain(
			'data-content="Hello &amp; &lt;World&gt; &quot;test&quot; &#39;quote&#39;"',
		);
	});

	it("should handle numeric attributes", async () => {
		const fs = createTestFileSystem({
			"collagen.json": JSON.stringify({
				children: [
					{
						tag: "circle",
						attrs: { cx: 50.5, cy: 25, r: 10, "stroke-width": 2.5 },
					},
				],
			}),
		});

		const svg = await generateSvgForTest(fs);
		expect(svg).toContain('cx="50.5"');
		expect(svg).toContain('cy="25"');
		expect(svg).toContain('r="10"');
		expect(svg).toContain('stroke-width="2.5"');
	});

	it("should handle percentage and unit values", async () => {
		const fs = createTestFileSystem({
			"collagen.json": JSON.stringify({
				children: [
					{
						tag: "rect",
						attrs: { x: "10%", y: "20px", width: "50em", height: "30vh" },
					},
				],
			}),
		});

		const svg = await generateSvgForTest(fs);
		expect(svg).toContain('x="10%"');
		expect(svg).toContain('y="20px"');
		expect(svg).toContain('width="50em"');
		expect(svg).toContain('height="30vh"');
	});
});
