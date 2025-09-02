/**
 * Image handling tests for Collagen TypeScript implementation
 *
 * These tests verify image embedding and base64 encoding functionality.
 */

import { describe, it, expect } from "vitest";
import { generateSvgFromFiles, TEST_IMAGE_PNG } from "./test-utils.js";

// =============================================================================
// Helper Functions
// =============================================================================

// =============================================================================
// Image Tag Tests
// =============================================================================

describe("Image Tag Tests", () => {
	it("should embed PNG image with base64 encoding", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: [
					{
						image_path: "test.png",
						attrs: { x: 10, y: 20, width: 100, height: 50 },
					},
				],
			}),
			"test.png": TEST_IMAGE_PNG,
		};

		const svg = await generateSvgFromFiles(files);

		// Check that it's an image tag with data URI
		expect(svg).toContain("<image");
		expect(svg).toContain('href="data:image/png;base64,');
		expect(svg).toContain('x="10"');
		expect(svg).toContain('y="20"');
		expect(svg).toContain('width="100"');
		expect(svg).toContain('height="50"');

		// Check that the base64 data is included (starts with PNG signature)
		expect(svg).toContain("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1Pe");
	});

	it("should infer image type from file extension", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: [
					{ image_path: "test.jpg" },
					{ image_path: "test.gif" },
					{ image_path: "test.webp" },
				],
			}),
			"test.jpg": TEST_IMAGE_PNG, // Using PNG data but .jpg extension
			"test.gif": TEST_IMAGE_PNG,
			"test.webp": TEST_IMAGE_PNG,
		};

		const svg = await generateSvgFromFiles(files);

		expect(svg).toContain("data:image/jpeg;base64,");
		expect(svg).toContain("data:image/gif;base64,");
		expect(svg).toContain("data:image/webp;base64,");
	});

	it("should use explicit kind over file extension", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: [
					{
						image_path: "test.jpg", // .jpg extension
						kind: "png", // but explicit PNG kind
						attrs: { x: 0, y: 0 },
					},
				],
			}),
			"test.jpg": TEST_IMAGE_PNG,
		};

		const svg = await generateSvgFromFiles(files);

		// Should use explicit kind (png) not extension (jpg)
		expect(svg).toContain("data:image/png;base64,");
		expect(svg).not.toContain("data:image/jpeg;base64,");
	});

	it("should handle image with children", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: [
					{
						image_path: "test.png",
						attrs: { x: 0, y: 0, width: 100, height: 100 },
						children: [{ tag: "title", children: ["Test Image"] }],
					},
				],
			}),
			"test.png": TEST_IMAGE_PNG,
		};

		const svg = await generateSvgFromFiles(files);

		expect(svg).toContain("<image");
		expect(svg).toContain('href="data:image/png;base64,');
		expect(svg).toContain("<title>Test Image</title>");
		expect(svg).toContain("</image>");
	});

	it("should handle image without explicit dimensions", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: [
					{
						image_path: "test.png",
						// No attrs specified
					},
				],
			}),
			"test.png": TEST_IMAGE_PNG,
		};

		const svg = await generateSvgFromFiles(files);

		expect(svg).toContain("<image");
		expect(svg).toContain('href="data:image/png;base64,');
		expect(svg).toContain("/>"); // Self-closing since no children
	});

	it("should throw error for missing image file", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: [{ image_path: "missing.png", attrs: { x: 0, y: 0 } }],
			}),
			// No image file provided
		};

		await expect(generateSvgFromFiles(files)).rejects.toThrow(
			"Missing file at path: missing.png",
		);
	});

	it("should handle images in subdirectories", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: [
					{ image_path: "assets/images/logo.png", attrs: { x: 0, y: 0 } },
				],
			}),
			"assets/images/logo.png": TEST_IMAGE_PNG,
		};

		const svg = await generateSvgFromFiles(files);

		expect(svg).toContain("<image");
		expect(svg).toContain('href="data:image/png;base64,');
	});

	it("should handle various image formats", async () => {
		// Test different extensions are properly mapped
		const testCases = [
			{ ext: "png", expectedMime: "png" },
			{ ext: "jpg", expectedMime: "jpeg" },
			{ ext: "jpeg", expectedMime: "jpeg" },
			{ ext: "gif", expectedMime: "gif" },
			{ ext: "webp", expectedMime: "webp" },
			{ ext: "bmp", expectedMime: "bmp" },
			{ ext: "svg", expectedMime: "svg+xml" },
			{ ext: "unknown", expectedMime: "png" }, // fallback
		];

		for (const { ext, expectedMime } of testCases) {
			const files = {
				"collagen.json": JSON.stringify({
					children: [{ image_path: `test.${ext}` }],
				}),
				[`test.${ext}`]: TEST_IMAGE_PNG,
			};

			const svg = await generateSvgFromFiles(files);
			expect(svg).toContain(`data:image/${expectedMime};base64,`);
		}
	});
});

// =============================================================================
// Edge Cases and Error Handling
// =============================================================================

describe("Image Error Handling", () => {
	it("should throw error for invalid image_path type", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: [
					{
						image_path: 123, // Should be string
						attrs: { x: 0, y: 0 },
					},
				],
			}),
		};

		await expect(generateSvgFromFiles(files)).rejects.toThrow(
			'Invalid type for field "image_path"',
		);
	});

	it("should throw error for unexpected keys in image tag", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: [
					{
						image_path: "test.png",
						unexpected_field: "value",
						attrs: { x: 0, y: 0 },
					},
				],
			}),
			"test.png": TEST_IMAGE_PNG,
		};

		await expect(generateSvgFromFiles(files)).rejects.toThrow(
			'Unexpected keys for tag "Image"',
		);
	});

	it("should throw error for invalid attrs type", async () => {
		const files = {
			"collagen.json": JSON.stringify({
				children: [
					{
						image_path: "test.png",
						attrs: "invalid", // Should be object
					},
				],
			}),
			"test.png": TEST_IMAGE_PNG,
		};

		// Should throw validation error for invalid attrs type
		await expect(generateSvgFromFiles(files)).rejects.toThrow(
			'Invalid type for field "attrs"',
		);
	});
});
