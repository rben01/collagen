/**
 * Compatibility tests between TypeScript and Rust implementations
 *
 * These tests verify that the TypeScript implementation produces
 * identical or equivalent output to the Rust implementation for
 * the same inputs.
 */

import { describe, it, expect } from "vitest";
import { generateSvgFromFiles } from "../index.js";
import { expectSvgEqual } from "./test-utils.js";

// =============================================================================
// Test Utilities
// =============================================================================

/** Create a mock File object for testing */
function createMockFile(
	name: string,
	content: string,
	type = "text/plain",
): File {
	const blob = new Blob([content], { type });
	return new File([blob], name, { type });
}

/** Create a mock binary File object for testing */
function createMockBinaryFile(
	name: string,
	data: number[],
	type = "application/octet-stream",
): File {
	const uint8Array = new Uint8Array(data);
	const blob = new Blob([uint8Array.buffer], { type });
	return new File([blob], name, { type });
}

// =============================================================================
// Rust Test Case Compatibility
// =============================================================================

describe("Rust Test Case Compatibility", () => {
	it("should match empty SVG output", async () => {
		const files = { "collagen.json": createMockFile("collagen.json", "{}") };

		const svg = await generateSvgFromFiles(files);
		expectSvgEqual(svg, '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
	});

	it("should match basic smiley SVG output", async () => {
		const manifest = {
			attrs: { viewBox: "0 0 50 50" },
			children: [
				// Face
				{
					tag: "circle",
					attrs: {
						cx: 25,
						cy: 25,
						r: 20,
						fill: "yellow",
						stroke: "black",
						"stroke-width": 2,
					},
				},
				// Left eye
				{ tag: "circle", attrs: { cx: 18, cy: 18, r: 3, fill: "black" } },
				// Right eye
				{ tag: "circle", attrs: { cx: 32, cy: 18, r: 3, fill: "black" } },
				// Mouth
				{
					tag: "path",
					attrs: {
						d: "M 15 30 Q 25 40 35 30",
						stroke: "black",
						"stroke-width": 2,
						fill: "none",
					},
				},
			],
		};

		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify(manifest),
			),
		};

		const svg = await generateSvgFromFiles(files);

		// Verify basic structure
		expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
		expect(svg).toContain('viewBox="0 0 50 50"');

		// Verify smiley elements
		expect(svg).toContain('<circle cx="25" cy="25" r="20"');
		expect(svg).toContain('fill="yellow"');
		expect(svg).toContain('<circle cx="18" cy="18" r="3"');
		expect(svg).toContain('<circle cx="32" cy="18" r="3"');
		expect(svg).toContain('<path d="M 15 30 Q 25 40 35 30"');
	});

	it("should match text handling", async () => {
		const manifest = {
			children: [
				"Plain string text",
				{ text: "Object text" },
				{ text: "Escaped: <>&\"'", is_preescaped: false },
				{ text: "<b>Preescaped HTML</b>", is_preescaped: true },
			],
		};

		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify(manifest),
			),
		};

		const svg = await generateSvgFromFiles(files);

		expect(svg).toContain("Plain string text");
		expect(svg).toContain("Object text");
		expect(svg).toContain("Escaped: &lt;&gt;&amp;&quot;&#39;");
		expect(svg).toContain("<b>Preescaped HTML</b>");
	});

	it("should match image embedding", async () => {
		const manifest = {
			children: [
				{
					image_path: "test.png",
					attrs: { x: 10, y: 10, width: 100, height: 50 },
				},
			],
		};

		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify(manifest),
			),
			"test.png": createMockBinaryFile(
				"test.png",
				[0x89, 0x50, 0x4e, 0x47],
				"image/png",
			),
		};

		const svg = await generateSvgFromFiles(files);

		expect(svg).toContain("<image");
		expect(svg).toContain('x="10"');
		expect(svg).toContain('y="10"');
		expect(svg).toContain('width="100"');
		expect(svg).toContain('height="50"');
		expect(svg).toContain('href="data:image/png;base64,');
		expect(svg).toContain("iVBORw=="); // Base64 PNG header
	});

	it("should match nested group structure", async () => {
		const manifest = {
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
		};

		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify(manifest),
			),
		};

		const svg = await generateSvgFromFiles(files);

		const expected =
			'<svg xmlns="http://www.w3.org/2000/svg">' +
			'<g transform="translate(10,10)">' +
			'<circle cx="0" cy="0" r="5" fill="blue"/>' +
			'<g opacity="0.5">' +
			'<rect x="-2" y="-2" width="4" height="4" fill="red"/>' +
			"</g>" +
			"</g>" +
			"</svg>";

		expectSvgEqual(svg, expected);
	});
});

// =============================================================================
// Attribute Handling Compatibility
// =============================================================================

describe("Attribute Handling Compatibility", () => {
	it("should match XML escaping behavior", async () => {
		const testCases = [
			{ input: "&", expected: "&amp;" },
			{ input: "<", expected: "&lt;" },
			{ input: ">", expected: "&gt;" },
			{ input: '"', expected: "&quot;" },
			{ input: "'", expected: "&#39;" },
			{ input: "Mix: &<>\"'", expected: "Mix: &amp;&lt;&gt;&quot;&#39;" },
		];

		for (const { input, expected } of testCases) {
			const manifest = {
				children: [
					{
						tag: "text",
						attrs: { "data-test": input },
						children: [input],
					},
				],
			};

			const files = {
				"collagen.json": createMockFile(
					"collagen.json",
					JSON.stringify(manifest),
				),
			};

			const svg = await generateSvgFromFiles(files);

			expect(svg).toContain(`data-test="${expected}"`);
			expect(svg).toContain(`>${expected}<`);
		}
	});

	it("should match numeric attribute formatting", async () => {
		const manifest = {
			children: [
				{
					tag: "rect",
					attrs: {
						x: 0,
						y: 10.5,
						width: 100,
						height: 50.25,
						"stroke-width": 2.0,
					},
				},
			],
		};

		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify(manifest),
			),
		};

		const svg = await generateSvgFromFiles(files);

		expect(svg).toContain('x="0"');
		expect(svg).toContain('y="10.5"');
		expect(svg).toContain('width="100"');
		expect(svg).toContain('height="50.25"');
		expect(svg).toContain('stroke-width="2"');
	});

	it("should match self-closing tag behavior", async () => {
		const selfClosingTags = [
			"circle",
			"ellipse",
			"line",
			"path",
			"polygon",
			"polyline",
			"rect",
			"stop",
			"use",
		];

		const regularTags = [
			"g",
			"text",
			"svg",
			"defs",
			"style",
			"title",
			"desc",
		];

		// Test self-closing tags
		for (const tagName of selfClosingTags) {
			const manifest = {
				children: [{ tag: tagName, attrs: { id: "test" } }],
			};

			const files = {
				"collagen.json": createMockFile(
					"collagen.json",
					JSON.stringify(manifest),
				),
			};

			const svg = await generateSvgFromFiles(files);
			expect(svg).toContain(`<${tagName} id="test"/>`);
		}

		// Test regular tags
		for (const tagName of regularTags) {
			const manifest = {
				children: [{ tag: tagName, attrs: { id: "test" } }],
			};

			const files = {
				"collagen.json": createMockFile(
					"collagen.json",
					JSON.stringify(manifest),
				),
			};

			const svg = await generateSvgFromFiles(files);
			expect(svg).toContain(`<${tagName} id="test"></${tagName}>`);
		}
	});
});

// =============================================================================
// Font Handling Compatibility
// =============================================================================

describe("Font Handling Compatibility", () => {
	it("should match user font embedding", async () => {
		const manifest = {
			children: [
				{
					fonts: [
						{
							name: "CustomFont",
							path: "font.woff2",
							attrs: { "font-weight": "bold" },
						},
					],
					attrs: { id: "font-defs" },
				},
			],
		};

		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify(manifest),
			),
			"font.woff2": createMockBinaryFile(
				"font.woff2",
				[0x77, 0x4f, 0x46, 0x32],
				"font/woff2",
			),
		};

		const svg = await generateSvgFromFiles(files);

		expect(svg).toContain('<defs id="font-defs">');
		expect(svg).toContain("<style>");
		expect(svg).toContain("@font-face{");
		expect(svg).toContain("font-family:CustomFont;");
		expect(svg).toContain("src:url('data:font/woff2;charset=utf-8;base64,");
		expect(svg).toContain("') format('woff2');");
		expect(svg).toContain("font-weight:bold;");
		expect(svg).toContain("}</style>");
		expect(svg).toContain("</defs>");
	});

	it("should match bundled font handling", async () => {
		const manifest = {
			children: [{ fonts: [{ name: "Impact", bundled: true }] }],
		};

		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify(manifest),
			),
		};

		const svg = await generateSvgFromFiles(files);

		expect(svg).toContain("@font-face{");
		expect(svg).toContain("font-family:Impact;");
		expect(svg).toContain(
			"src:url('data:font/woff2;charset=utf-8;base64,d09GMgABAAAAAOSkABIAAAA",
		);
	});

	it("should match multiple font handling", async () => {
		const manifest = {
			children: [
				{
					fonts: [
						{ name: "Font1", path: "font1.woff" },
						{ name: "Impact", bundled: true },
						{ name: "Font2", path: "font2.ttf" },
					],
				},
			],
		};

		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify(manifest),
			),
			"font1.woff": createMockBinaryFile(
				"font1.woff",
				[0x77, 0x4f, 0x46, 0x00],
				"font/woff",
			),
			"font2.ttf": createMockBinaryFile(
				"font2.ttf",
				[0x00, 0x01, 0x00, 0x00],
				"font/ttf",
			),
		};

		const svg = await generateSvgFromFiles(files);

		expect(svg).toContain("font-family:Font1;");
		expect(svg).toContain("font-family:Impact;");
		expect(svg).toContain("font-family:Font2;");
	});
});

// =============================================================================
// Path Resolution Compatibility
// =============================================================================

describe("Path Resolution Compatibility", () => {
	it("should match relative path resolution", async () => {
		const manifest = {
			children: [
				{ image_path: "images/logo.png" },
				{ svg_path: "graphics/icon.svg" },
			],
		};

		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify(manifest),
			),
			"images/logo.png": createMockBinaryFile(
				"logo.png",
				[0x89, 0x50],
				"image/png",
			),
			"graphics/icon.svg": createMockFile(
				"icon.svg",
				"<svg><circle r='5'/></svg>",
			),
		};

		const svg = await generateSvgFromFiles(files);

		expect(svg).toContain("<image");
		expect(svg).toContain('href="data:image/png;base64,');
		expect(svg).toContain("<g>"); // From nested SVG
		expect(svg).toContain("<circle r='5'/>");
	});

	it("should match nested directory handling", async () => {
		const manifest = {
			children: [{ image_path: "assets/images/deep/nested/file.jpg" }],
		};

		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify(manifest),
			),
			"assets/images/deep/nested/file.jpg": createMockBinaryFile(
				"file.jpg",
				[0xff, 0xd8],
				"image/jpeg",
			),
		};

		const svg = await generateSvgFromFiles(files);

		expect(svg).toContain("<image");
		expect(svg).toContain('href="data:image/jpeg;base64,');
	});
});

// =============================================================================
// Error Handling Compatibility
// =============================================================================

describe("Error Handling Compatibility", () => {
	it("should match validation error behavior", async () => {
		const invalidManifests = [
			// Unrecognized object
			{ children: [{ unknown_field: "value" }] },
			// Invalid type
			{ children: [123] },
			// Missing required field
			{ children: [{ tag: null }] },
		];

		for (const manifest of invalidManifests) {
			const files = {
				"collagen.json": createMockFile(
					"collagen.json",
					JSON.stringify(manifest),
				),
			};

			await expect(generateSvgFromFiles(files)).rejects.toThrow();
		}
	});

	it("should match missing file error behavior", async () => {
		const manifests = [
			{ children: [{ image_path: "missing.png" }] },
			{ children: [{ svg_path: "missing.svg" }] },
			{ children: [{ fonts: [{ name: "Font", path: "missing.woff" }] }] },
		];

		for (const manifest of manifests) {
			const files = {
				"collagen.json": createMockFile(
					"collagen.json",
					JSON.stringify(manifest),
				),
			};

			await expect(generateSvgFromFiles(files)).rejects.toThrow();
		}
	});

	it("should match JSON parsing error behavior", async () => {
		const files = {
			"collagen.json": createMockFile("collagen.json", "{ invalid json }"),
		};

		await expect(generateSvgFromFiles(files)).rejects.toThrow();
	});
});

// =============================================================================
// Complex Compatibility Tests
// =============================================================================

describe("Complex Compatibility", () => {
	it("should match complex nested structure", async () => {
		const manifest = {
			attrs: { viewBox: "0 0 400 300", width: 400, height: 300 },
			children: [
				// Background
				{
					tag: "rect",
					attrs: { x: 0, y: 0, width: 400, height: 300, fill: "#f8f9fa" },
				},
				// Header group
				{
					tag: "g",
					attrs: { id: "header" },
					children: [
						{
							tag: "rect",
							attrs: {
								x: 0,
								y: 0,
								width: 400,
								height: 60,
								fill: "#007bff",
							},
						},
						{
							tag: "text",
							attrs: {
								x: 200,
								y: 35,
								"text-anchor": "middle",
								fill: "white",
								"font-size": 24,
							},
							children: ["Header Title"],
						},
					],
				},
				// Content with image
				{
					tag: "g",
					attrs: { transform: "translate(20, 80)" },
					children: [
						{
							image_path: "content.png",
							attrs: { x: 0, y: 0, width: 100, height: 100 },
						},
						{
							tag: "text",
							attrs: { x: 120, y: 50 },
							children: ["Image description"],
						},
					],
				},
				// Footer with mixed content
				{
					tag: "g",
					attrs: { id: "footer", transform: "translate(0, 240)" },
					children: [
						"Footer text: ",
						{ text: "&copy; 2024", is_preescaped: false },
						{
							tag: "a",
							attrs: { href: "https://example.com" },
							children: [" - Visit us"],
						},
					],
				},
			],
		};

		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify(manifest),
			),
			"content.png": createMockBinaryFile(
				"content.png",
				[0x89, 0x50, 0x4e, 0x47],
				"image/png",
			),
		};

		const svg = await generateSvgFromFiles(files);

		// Verify overall structure
		expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
		expect(svg).toContain('viewBox="0 0 400 300"');

		// Verify header
		expect(svg).toContain('<g id="header">');
		expect(svg).toContain('fill="#007bff"');
		expect(svg).toContain("Header Title");

		// Verify content
		expect(svg).toContain('transform="translate(20, 80)"');
		expect(svg).toContain("<image");
		expect(svg).toContain('href="data:image/png;base64,');
		expect(svg).toContain("Image description");

		// Verify footer
		expect(svg).toContain('<g id="footer"');
		expect(svg).toContain("Footer text: ");
		expect(svg).toContain("&amp;copy; 2024");
		expect(svg).toContain("Visit us");
	});

	it("should match edge case handling", async () => {
		const manifest = {
			children: [
				// Empty elements
				"",
				{ text: "" },
				{ tag: "g", children: [] },

				// Special characters
				"Special: <>&\"'",
				{ text: "Escaped: <>&\"'", is_preescaped: false },

				// Numeric edge cases
				{ tag: "rect", attrs: { x: 0, y: 0.0, width: 100.5, height: 50 } },
			],
		};

		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify(manifest),
			),
		};

		const svg = await generateSvgFromFiles(files);

		expect(svg).toContain("<g></g>");
		expect(svg).toContain("Special: &lt;&gt;&amp;&quot;&#39;");
		expect(svg).toContain("Escaped: &lt;&gt;&amp;&quot;&#39;");
		expect(svg).toContain('x="0"');
		expect(svg).toContain('y="0"');
		expect(svg).toContain('width="100.5"');
	});
});
