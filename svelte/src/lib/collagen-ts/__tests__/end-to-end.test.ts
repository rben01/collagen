/**
 * End-to-end integration tests for Collagen TypeScript implementation
 *
 * Tests the complete pipeline from file input to SVG output,
 * covering all major features and workflows.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	generateSvgFromFiles,
	generateSvgFromFileSystem,
	parseManifest,
	createFileSystem,
	getSupportedFormats,
	getAvailableManifestFormat,
	getFileSystemInfo,
} from "../index.js";

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

/** Create test files for a complete Collagen project */
function createTestProject(): Record<string, File> {
	return {
		"collagen.json": createMockFile(
			"collagen.json",
			JSON.stringify({
				attrs: { viewBox: "0 0 400 300", width: 400, height: 300 },
				children: [
					{
						tag: "rect",
						attrs: {
							x: 0,
							y: 0,
							width: 400,
							height: 300,
							fill: "#f0f0f0",
						},
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
		),
		"logo.png": createMockBinaryFile(
			"logo.png",
			[0x89, 0x50, 0x4e, 0x47],
			"image/png",
		),
		"icon.svg": createMockFile(
			"icon.svg",
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="blue"/></svg>',
			"image/svg+xml",
		),
	};
}

/** Create test files with fonts */
function createProjectWithFonts(): Record<string, File> {
	return {
		"collagen.json": createMockFile(
			"collagen.json",
			JSON.stringify({
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
		),
		"fonts/custom.woff2": createMockBinaryFile(
			"custom.woff2",
			[0x77, 0x4f, 0x46, 0x32],
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
		const filesystem = await createFileSystem(files);

		const svg = await generateSvgFromFileSystem(filesystem);
		expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
		expect(svg).toContain("Hello, World!");
	});

	it("should parse manifest without generating SVG", async () => {
		const files = createTestProject();
		const filesystem = await createFileSystem(files);

		const rootTag = await parseManifest(filesystem);
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
		const files = { "collagen.json": createMockFile("collagen.json", "{}") };
		const filesystem = await createFileSystem(files);

		const format = getAvailableManifestFormat(filesystem);
		expect(format).toBe("json");
	});

	it("should prefer Jsonnet over JSON", async () => {
		const files = {
			"collagen.json": createMockFile("collagen.json", "{}"),
			"collagen.jsonnet": createMockFile("collagen.jsonnet", "{}"),
		};
		const filesystem = await createFileSystem(files);

		const format = getAvailableManifestFormat(filesystem);
		expect(format).toBe("jsonnet");
	});

	it("should return null when no manifest exists", async () => {
		const files = { "other.txt": createMockFile("other.txt", "content") };
		const filesystem = await createFileSystem(files);

		const format = getAvailableManifestFormat(filesystem);
		expect(format).toBeNull();
	});

	it("should list supported formats", () => {
		const formats = getSupportedFormats();
		expect(formats).toContain("json");
		expect(formats).toContain("jsonnet");
		expect(formats).toHaveLength(2);
	});

	it("should force specific format", async () => {
		const files = {
			"collagen.json": createMockFile("collagen.json", "{}"),
			"collagen.jsonnet": createMockFile("collagen.jsonnet", "{}"),
		};

		// Force JSON format
		const svg1 = await generateSvgFromFiles(files, "json");
		expect(svg1).toContain("<svg");

		// Force Jsonnet format (will use mock)
		const svg2 = await generateSvgFromFiles(files, "jsonnet");
		expect(svg2).toContain("<svg");
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
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify({
					children: [
						"Plain text",
						{ text: "Object text" },
						{ text: "<b>Preescaped</b>", is_preescaped: true },
						{ tag: "rect", attrs: { x: 0, y: 0, width: 10, height: 10 } },
						{ image_path: "test.jpg" },
					],
				}),
			),
			"test.jpg": createMockBinaryFile(
				"test.jpg",
				[0xff, 0xd8, 0xff],
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
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify({
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
			),
		};

		const svg = await generateSvgFromFiles(files);

		expect(svg).toContain('id="level1"');
		expect(svg).toContain('id="level2"');
		expect(svg).toContain('id="level3"');
		expect(svg).toContain("<circle");
	});

	it("should handle empty and minimal projects", async () => {
		const files = { "collagen.json": createMockFile("collagen.json", "{}") };

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
		const filesystem = await createFileSystem(files);

		const info = getFileSystemInfo(filesystem);

		expect(info.fileCount).toBe(3);
		expect(info.totalSize).toBeGreaterThan(0);
		expect(info.paths).toHaveLength(3);
		expect(info.paths).toContain("collagen.json");
		expect(info.paths).toContain("logo.png");
		expect(info.paths).toContain("icon.svg");
		expect(info.manifestFormat).toBe("json");
	});

	it("should handle empty filesystem", async () => {
		const filesystem = await createFileSystem({});
		const info = getFileSystemInfo(filesystem);

		expect(info.fileCount).toBe(0);
		expect(info.totalSize).toBe(0);
		expect(info.paths).toEqual([]);
		expect(info.manifestFormat).toBeNull();
	});

	it("should detect Jsonnet format in info", async () => {
		const files = {
			"collagen.jsonnet": createMockFile("collagen.jsonnet", "{}"),
		};
		const filesystem = await createFileSystem(files);
		const info = getFileSystemInfo(filesystem);

		expect(info.manifestFormat).toBe("jsonnet");
	});
});

// =============================================================================
// Error Handling in End-to-End Tests
// =============================================================================

describe("End-to-End Error Handling", () => {
	it("should handle missing manifest files", async () => {
		const files = { "README.md": createMockFile("README.md", "# Project") };

		await expect(generateSvgFromFiles(files)).rejects.toThrow(
			"Missing manifest file",
		);
	});

	it("should handle invalid JSON", async () => {
		const files = {
			"collagen.json": createMockFile("collagen.json", "{ invalid json }"),
		};

		await expect(generateSvgFromFiles(files)).rejects.toThrow();
	});

	it("should handle missing image files", async () => {
		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify({ children: [{ image_path: "missing.jpg" }] }),
			),
		};

		await expect(generateSvgFromFiles(files)).rejects.toThrow();
	});

	it("should handle missing font files", async () => {
		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify({
					children: [
						{ fonts: [{ name: "CustomFont", path: "missing.woff2" }] },
					],
				}),
			),
		};

		await expect(generateSvgFromFiles(files)).rejects.toThrow();
	});

	it("should handle missing SVG files", async () => {
		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify({ children: [{ svg_path: "missing.svg" }] }),
			),
		};

		await expect(generateSvgFromFiles(files)).rejects.toThrow();
	});

	it("should handle validation errors", async () => {
		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify({
					children: [
						{ unknown_field: "value" }, // Unrecognized object
					],
				}),
			),
		};

		await expect(generateSvgFromFiles(files)).rejects.toThrow();
	});
});

// =============================================================================
// Performance and Scalability Tests
// =============================================================================

describe("Performance and Scalability", () => {
	it("should handle large number of elements", async () => {
		const children = [...Array(100)]
			.map((_, i) => ({
				tag: "rect",
				attrs: {
					x: (i % 10) * 20,
					y: Math.floor(i / 10) * 20,
					width: 15,
					height: 15,
				},
			}));

		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify({ attrs: { viewBox: "0 0 200 200" }, children }),
			),
		};

		const svg = await generateSvgFromFiles(files);

		// Should generate all 100 rectangles
		const rectCount = (svg.match(/<rect/g) || []).length;
		expect(rectCount).toBe(100);
	});

	it("should handle large image files", async () => {
		// Create a "large" mock image (1000 bytes)
		const largeImageData = [...Array(1000)]
			.map((_, i) => i % 256);

		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify({ children: [{ image_path: "large.png" }] }),
			),
			"large.png": createMockBinaryFile(
				"large.png",
				largeImageData,
				"image/png",
			),
		};

		const svg = await generateSvgFromFiles(files);
		expect(svg).toContain("<image");
		expect(svg).toContain("data:image/png;base64,");
	});

	it("should handle many small files", async () => {
		const files: Record<string, File> = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify({
					children: [...Array(20)]
						.map((_, i) => ({
							image_path: `icon${i}.png`,
							attrs: { x: i * 20, y: 0, width: 16, height: 16 },
						})),
				}),
			),
		};

		// Add 20 small icon files
		for (let i = 0; i < 20; i++) {
			files[`icon${i}.png`] = createMockBinaryFile(
				`icon${i}.png`,
				[0x89, 0x50, 0x4e, 0x47],
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
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify({
					children: [
						{ image_path: "assets/images/deep/nested/icon.png" },
						{ svg_path: "graphics/vectors/shapes/circle.svg" },
					],
				}),
			),
			"assets/images/deep/nested/icon.png": createMockBinaryFile(
				"icon.png",
				[0x89, 0x50],
				"image/png",
			),
			"graphics/vectors/shapes/circle.svg": createMockFile(
				"circle.svg",
				'<svg><circle r="10"/></svg>',
			),
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
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify({
					children: [
						{ image_path: "files with spaces/special-chars_123.png" },
					],
				}),
			),
			"files with spaces/special-chars_123.png": createMockBinaryFile(
				"special.png",
				[0x89, 0x50],
				"image/png",
			),
		};

		const svg = await generateSvgFromFiles(files);
		expect(svg).toContain("<image");
	});

	it("should handle unicode content", async () => {
		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify({
					children: [
						"🌍 Hello World! 中文 العربية",
						{ text: "Unicode: 🎨✨🚀💻🌟" },
					],
				}),
			),
		};

		const svg = await generateSvgFromFiles(files);
		expect(svg).toContain("🌍 Hello World! 中文 العربية");
		expect(svg).toContain("Unicode: 🎨✨🚀💻🌟");
	});

	it("should handle empty and whitespace-only content", async () => {
		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify({
					children: ["", "   ", { text: "" }, { text: "   \n\t   " }],
				}),
			),
		};

		const svg = await generateSvgFromFiles(files);
		expect(svg).toContain("<svg");
		// Empty content should still be present in SVG
	});

	it("should handle boolean and numeric attribute values", async () => {
		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify({
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
			),
		};

		const svg = await generateSvgFromFiles(files);
		expect(svg).toContain('x="0"');
		expect(svg).toContain('width="100.5"');
		expect(svg).toContain('stroke-width="2.5"');
		expect(svg).toContain('rx="5"');
	});

	it("should handle self-closing vs regular tags", async () => {
		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify({
					children: [
						{ tag: "rect" }, // Self-closing when empty
						{ tag: "g" }, // Not self-closing
						{ tag: "circle", children: ["<title>Circle</title>"] }, // With content
					],
				}),
			),
		};

		const svg = await generateSvgFromFiles(files);
		expect(svg).toContain("<rect/>");
		expect(svg).toContain("<g></g>");
		expect(svg).toContain("<circle>");
		expect(svg).toContain("</circle>");
	});
});
