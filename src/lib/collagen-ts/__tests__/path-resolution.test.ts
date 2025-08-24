/**
 * Test path resolution to ensure canonical paths are used consistently
 */

import { describe, it, expect } from "vitest";
import { normalizedPathJoin } from "../filesystem/index.js";
import { generateSvgFromFiles } from "../index.js";
import { createFileFromString } from "./test-utils.js";

describe("Path Resolution", () => {
	it("should resolve relative paths consistently", () => {
		// Test normalizedPathJoin function
		expect(normalizedPathJoin("", "file.txt")).toBe("file.txt");
		expect(normalizedPathJoin("", "./file.txt")).toBe("file.txt");
		expect(normalizedPathJoin("dir", "file.txt")).toBe("dir/file.txt");
		expect(normalizedPathJoin("dir", "./file.txt")).toBe("dir/file.txt");
		expect(normalizedPathJoin("dir/sub", "../file.txt")).toBe("dir/file.txt");
		expect(normalizedPathJoin("dir", "./sub/../file.txt")).toBe(
			"dir/file.txt",
		);
	});

	it("should normalize paths consistently", () => {
		expect(normalizedPathJoin("file.txt")).toBe("file.txt");
		expect(normalizedPathJoin("./file.txt")).toBe("file.txt");
		expect(normalizedPathJoin("dir/file.txt")).toBe("dir/file.txt");
		expect(normalizedPathJoin("dir//file.txt")).toBe("dir/file.txt");
		expect(normalizedPathJoin("/dir/file.txt")).toBe("dir/file.txt");
		expect(normalizedPathJoin("dir/file.txt/")).toBe("dir/file.txt");
	});

	it("should resolve image paths correctly in SVG generation", async () => {
		// Create a simple image
		const imageBytes = new Uint8Array([
			0x89,
			0x50,
			0x4e,
			0x47,
			0x0d,
			0x0a,
			0x1a,
			0x0a, // PNG header
		]);

		// Test with different path formats that should resolve to the same file
		const files = new Map<string, File>([
			[
				"collagen.json",
				createFileFromString(
					JSON.stringify({
						children: [
							{ image_path: "image.png" },
							{ image_path: "./image.png" },
						],
					}),
					"collagen.json",
				),
			],
			[
				"image.png",
				new File([imageBytes], "image.png", { type: "image/png" }),
			],
		]);

		// This should work without throwing an error about missing files
		await expect(generateSvgFromFiles(files)).resolves.toContain("<image");
	});

	it("should handle nested directory paths correctly", async () => {
		const imageBytes = new Uint8Array([
			0x89,
			0x50,
			0x4e,
			0x47,
			0x0d,
			0x0a,
			0x1a,
			0x0a, // PNG header
		]);

		const files = new Map<string, File>([
			[
				"collagen.json",
				createFileFromString(
					JSON.stringify({
						children: [
							{ image_path: "assets/image.png" },
							{ image_path: "./assets/image.png" },
						],
					}),
					"collagen.json",
				),
			],
			[
				"assets/image.png",
				new File([imageBytes], "image.png", { type: "image/png" }),
			],
		]);

		await expect(generateSvgFromFiles(files)).resolves.toContain("<image");
	});

	it("should handle parent directory references", async () => {
		const imageBytes = new Uint8Array([
			0x89,
			0x50,
			0x4e,
			0x47,
			0x0d,
			0x0a,
			0x1a,
			0x0a, // PNG header
		]);

		// Manifest at root, but references files using relative paths including parent dirs
		const files = new Map<string, File>([
			[
				"collagen.json",
				createFileFromString(
					JSON.stringify({
						children: [
							{ image_path: "folder/../image.png" }, // This should resolve to just "image.png"
						],
					}),
					"collagen.json",
				),
			],
			[
				"image.png",
				new File([imageBytes], "image.png", { type: "image/png" }),
			],
		]);

		// This would fail if path resolution doesn't work correctly
		await expect(generateSvgFromFiles(files)).resolves.toContain("<image");
	});
});
