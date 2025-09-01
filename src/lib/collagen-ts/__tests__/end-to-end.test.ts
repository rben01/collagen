/**
 * End-to-end integration tests for Collagen TypeScript implementation
 *
 * Tests the complete pipeline from file input to SVG output,
 * covering all major features and workflows.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	toText,
	createFileSystem,
	generateSvgFromFiles,
	createFileFromBytes,
} from "./test-utils.js";

// =============================================================================
// Test Utilities
// =============================================================================

/** Create a mock File object for testing */

/** Create test files for a complete Collagen project */
function createTestProject(): Record<string, string | File> {
	return {
		"collagen.json": JSON.stringify({
			attrs: { viewBox: "0 0 400 300", width: 400, height: 300 },
			children: [
				{
					tag: "rect",
					attrs: { x: 0, y: 0, width: 400, height: 300, fill: "#f0f0f0" },
				},
				{
					image_path: "logo.png",
					attrs: { x: 10, y: 10, width: 100, height: 50 },
				},
				{
					tag: "text",
					attrs: {
						x: 120,
						y: 35,
						"font-family": "Arial",
						"font-size": 16,
					},
					children: ["Hello, World!"],
				},
				{
					svg_path: "icon.svg",
					attrs: { x: 300, y: 10, width: 80, height: 80 },
				},
			],
		}),
		"logo.png": createFileFromBytes(
			new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
			"logo.png",
			"image/png",
		),
		"icon.svg":
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="blue"/></svg>',
	};
}

/** Create test files with fonts */
function createProjectWithFonts(): Record<string, string | File> {
	return {
		"collagen.json": JSON.stringify({
			children: [
				{
					fonts: [
						{ name: "Impact", bundled: true },
						{ name: "CustomFont", path: "fonts/custom.woff2" },
					],
				},
				{
					tag: "text",
					attrs: { x: 10, y: 30, "font-family": "Impact" },
					children: ["Impact Text"],
				},
				{
					tag: "text",
					attrs: { x: 10, y: 60, "font-family": "CustomFont" },
					children: ["Custom Font Text"],
				},
			],
		}),
		"fonts/custom.woff2": createFileFromBytes(
			new Uint8Array([0x77, 0x4f, 0x46, 0x32]),
			"custom.woff2",
			"font/woff2",
		),
	};
}

// Mock sjsonnet for Jsonnet tests
const mockSjsonnet = {
	interpret: vi.fn(code => {
		// Simple mock that returns basic structures
		if (code.includes("config.width")) {
			return {
				attrs: { viewBox: "0 0 300 200" },
				children: [
					{
						tag: "rect",
						attrs: {
							x: 0,
							y: 0,
							width: 300,
							height: 200,
							fill: "#ffffff",
						},
					},
				],
			};
		}
		return { mock: "result" };
	}),
};

beforeEach(() => {
	vi.stubGlobal("window", { SjsonnetMain: mockSjsonnet });
});

// =============================================================================
// Basic End-to-End Tests
// =============================================================================

describe("Basic End-to-End Pipeline", () => {
	it("should process complete JSON project", async () => {
		const files = createTestProject();
		const svg = await generateSvgFromFiles(files);

		// Verify SVG structure
		expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
		expect(svg).toContain('viewBox="0 0 400 300"');
		expect(svg).toContain('width="400"');
		expect(svg).toContain('height="300"');

		// Verify content elements
		expect(svg).toContain("<rect");
		expect(svg).toContain('fill="#f0f0f0"');
		expect(svg).toContain("<image");
		expect(svg).toContain('href="data:image/png;base64,');
		expect(svg).toContain("<text");
		expect(svg).toContain("Hello, World!");
		expect(svg).toContain("<g"); // From nested SVG
	});

	it("should handle Map input format", async () => {
		const files = createTestProject();
		const fileMap = new Map(Object.entries(files));

		const svg = await generateSvgFromFiles(fileMap);
		expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
		expect(svg).toContain('viewBox="0 0 400 300"');
	});

	it("should process from pre-created filesystem", async () => {
		const files = createTestProject();
		const fs = await createFileSystem(files);

		const svg = await fs.generateSvg();
		expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
		expect(svg).toContain("Hello, World!");
	});

	it("should parse manifest without generating SVG", async () => {
		const files = createTestProject();
		const fs = await createFileSystem(files);

		const rootTag = await fs.generateRootTag();
		expect(rootTag.type).toBe("root");
		expect(rootTag.attrs.viewBox).toBe("0 0 400 300");
		expect(rootTag.children).toHaveLength(4);
	});
});

// =============================================================================
// Format Detection and Handling Tests
// =============================================================================

describe("Format Detection and Handling", () => {
	it("should detect JSON format", async () => {
		const files = { "collagen.json": "{}" };
		const fs = await createFileSystem(files);

		const { format, content } = fs.loadManifestContents();
		expect(format).toBe("json");
		expect(toText(content)).toBe("{}");
	});

	it("should prefer Jsonnet over JSON", async () => {
		const files = { "collagen.json": "{}", "collagen.jsonnet": "{}" };
		const fs = await createFileSystem(files);

		const { format, content } = fs.loadManifestContents();
		expect(format).toBe("jsonnet");
		expect(toText(content)).toBe("{}");
	});

	it("should return null when no manifest exists", async () => {
		const files = { "other.txt": "content" };
		const fs = await createFileSystem(files);

		expect(fs.loadManifestContents).toThrow();
	});
});

// =============================================================================
// Complex Project Tests
// =============================================================================

describe("Complex Project Processing", () => {
	it("should process project with fonts", async () => {
		const files = createProjectWithFonts();
		const svg = await generateSvgFromFiles(files);

		// Verify font definitions
		expect(svg).toContain("<defs>");
		expect(svg).toContain("<style>");
		expect(svg).toContain("@font-face{");
		expect(svg).toContain("font-family:Impact;");
		expect(svg).toContain("font-family:CustomFont;");

		// Verify text elements
		expect(svg).toContain("Impact Text");
		expect(svg).toContain("Custom Font Text");
	});

	it("should handle mixed content types", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: [
					"Plain text",
					{ text: "Object text" },
					{ text: "<b>Preescaped</b>", is_preescaped: true },
					{ tag: "rect", attrs: { x: 0, y: 0, width: 10, height: 10 } },
					{ image_path: "test.jpg" },
				],
			}),

			"test.jpg": createFileFromBytes(
				new Uint8Array([0xff, 0xd8, 0xff]),
				"test.jpg",
				"image/jpeg",
			),
		};

		const svg = await generateSvgFromFiles(files);

		expect(svg).toContain("Plain text");
		expect(svg).toContain("Object text");
		expect(svg).toContain("<b>Preescaped</b>");
		expect(svg).toContain("<rect");
		expect(svg).toContain("<image");
		expect(svg).toContain("data:image/jpeg;base64,");
	});

	it("should handle deeply nested structures", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: [
					{
						tag: "g",
						attrs: { id: "level1" },
						children: [
							{
								tag: "g",
								attrs: { id: "level2" },
								children: [
									{
										tag: "g",
										attrs: { id: "level3" },
										children: [
											{
												tag: "circle",
												attrs: { cx: 50, cy: 50, r: 25 },
											},
										],
									},
								],
							},
						],
					},
				],
			}),
		};

		const svg = await generateSvgFromFiles(files);

		expect(svg).toContain('id="level1"');
		expect(svg).toContain('id="level2"');
		expect(svg).toContain('id="level3"');
		expect(svg).toContain("<circle");
	});

	it("should handle empty and minimal projects", async () => {
		const files = { "collagen.json": "{}" };

		const svg = await generateSvgFromFiles(files);
		expect(svg).toBe('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
	});
});

// =============================================================================
// File System Info Tests
// =============================================================================

describe("File System Information", () => {
	it("should provide filesystem information", async () => {
		const files = createTestProject();
		const fs = await createFileSystem(files);

		expect(fs.getFileCount()).toBe(3);
		expect(fs.getTotalSize()).toBeGreaterThan(0);
		expect(fs.has("collagen.json")).toBe(true);
		expect(fs.has("logo.png")).toBe(true);
		expect(fs.has("icon.svg")).toBe(true);
	});

	it("should handle empty filesystem", async () => {
		const fs = await createFileSystem({});

		expect(fs.getFileCount()).toBe(0);
		expect(fs.getTotalSize()).toBe(0);
		expect(fs.has("collagen.json")).toBe(false);
	});
});

// =============================================================================
// Error Handling in End-to-End Tests
// =============================================================================

describe("End-to-End Error Handling", () => {
	it("should handle missing manifest files", async () => {
		const files = { "README.md": "# Project" };

		await expect(generateSvgFromFiles(files)).rejects.toThrow(
			"Missing manifest file",
		);
	});

	it("should handle invalid JSON", async () => {
		const files = { "collagen.json": "{ invalid json }" };

		await expect(generateSvgFromFiles(files)).rejects.toThrow();
	});

	it("should handle missing image files", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: [{ image_path: "missing.jpg" }],
			}),
		};

		await expect(generateSvgFromFiles(files)).rejects.toThrow();
	});

	it("should handle missing font files", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: [
					{ fonts: [{ name: "CustomFont", path: "missing.woff2" }] },
				],
			}),
		};

		await expect(generateSvgFromFiles(files)).rejects.toThrow();
	});

	it("should handle missing SVG files", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: [{ svg_path: "missing.svg" }],
			}),
		};

		await expect(generateSvgFromFiles(files)).rejects.toThrow();
	});

	it("should handle validation errors", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: [
					{ unknown_field: "value" }, // Unrecognized object
				],
			}),
		};

		await expect(generateSvgFromFiles(files)).rejects.toThrow();
	});
});

// =============================================================================
// Performance and Scalability Tests
// =============================================================================

describe("Performance and Scalability", () => {
	it("should handle large number of elements", async () => {
		const children = Array.from({ length: 100 }, (_, i) => ({
			tag: "rect",
			attrs: {
				x: (i % 10) * 20,
				y: Math.floor(i / 10) * 20,
				width: 15,
				height: 15,
			},
		}));

		const files = {
			"collagen.json": JSON.stringify({
				attrs: { viewBox: "0 0 200 200" },
				children,
			}),
		};

		const svg = await generateSvgFromFiles(files);

		// Should generate all 100 rectangles
		const rectCount = (svg.match(/<rect/g) || []).length;
		expect(rectCount).toBe(100);
	});

	it("should handle large image files", async () => {
		// Create a "large" mock image (1000 bytes)
		const largeImageData = new Uint8Array(
			Array.from({ length: 1000 }, (_, i) => i % 256),
		);

		const files = {
			"collagen.json": JSON.stringify({
				children: [{ image_path: "large.png" }],
			}),

			"large.png": createFileFromBytes(
				largeImageData,
				"large.png",
				"image/png",
			),
		};

		const svg = await generateSvgFromFiles(files);
		expect(svg).toContain("<image");
		expect(svg).toContain("data:image/png;base64,");
	});

	it("should handle many small files", async () => {
		const files: Record<string, string | File> = {
			"collagen.json": JSON.stringify({
				children: Array.from({ length: 20 }, (_, i) => ({
					image_path: `icon${i}.png`,
					attrs: { x: i * 20, y: 0, width: 16, height: 16 },
				})),
			}),
		};

		// Add 20 small icon files
		for (let i = 0; i < 20; i++) {
			files[`icon${i}.png`] = createFileFromBytes(
				new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
				`icon${i}.png`,
				"image/png",
			);
		}

		const svg = await generateSvgFromFiles(files);

		// Should embed all 20 images
		const imageCount = (svg.match(/<image/g) || []).length;
		expect(imageCount).toBe(20);
	});

	it("should handle deeply nested file structures", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: [
					{ image_path: "assets/images/deep/nested/icon.png" },
					{ svg_path: "graphics/vectors/shapes/circle.svg" },
				],
			}),
			"assets/images/deep/nested/icon.png": createFileFromBytes(
				new Uint8Array([0x89, 0x50]),
				"icon.png",
				"image/png",
			),
			"graphics/vectors/shapes/circle.svg": '<svg><circle r="10"/></svg>',
		};

		const svg = await generateSvgFromFiles(files);
		expect(svg).toContain("<image");
		expect(svg).toContain("<g>"); // From nested SVG
	});
});

// =============================================================================
// Edge Cases and Robustness Tests
// =============================================================================

describe("Edge Cases and Robustness", () => {
	it("should handle special characters in file paths", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: [
					{ image_path: "files with spaces/special-chars_123.png" },
				],
			}),
			"files with spaces/special-chars_123.png": createFileFromBytes(
				new Uint8Array([0x89, 0x50]),
				"special.png",
				"image/png",
			),
		};

		const svg = await generateSvgFromFiles(files);
		expect(svg).toContain("<image");
	});

	it("should handle unicode content", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: [
					"🌍 Hello World! 中文 العربية",
					{ text: "Unicode: 🎨✨🚀💻🌟" },
				],
			}),
		};

		const svg = await generateSvgFromFiles(files);
		expect(svg).toContain("🌍 Hello World! 中文 العربية");
		expect(svg).toContain("Unicode: 🎨✨🚀💻🌟");
	});

	it("should handle empty and whitespace-only content", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: ["", "   ", { text: "" }, { text: "   \n\t   " }],
			}),
		};

		const svg = await generateSvgFromFiles(files);
		expect(svg).toContain("<svg");
		// Empty content should still be present in SVG
	});

	it("should handle boolean and numeric attribute values", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: [
					{
						tag: "rect",
						attrs: {
							x: 0,
							y: 0,
							width: 100.5,
							height: 50,
							"stroke-width": 2.5,
							rx: 5,
						},
					},
				],
			}),
		};

		const svg = await generateSvgFromFiles(files);
		expect(svg).toContain('x="0"');
		expect(svg).toContain('width="100.5"');
		expect(svg).toContain('stroke-width="2.5"');
		expect(svg).toContain('rx="5"');
	});

	it("should handle self-closing vs regular tags", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: [
					{ tag: "rect" }, // Self-closing when empty
					{ tag: "g" }, // Not self-closing
					{ tag: "circle", children: ["<title>Circle</title>"] }, // With content
				],
			}),
		};

		const svg = await generateSvgFromFiles(files);
		expect(svg).toContain("<rect/>");
		expect(svg).toContain("<g></g>");
		expect(svg).toContain("<circle>");
		expect(svg).toContain("</circle>");
	});
});
