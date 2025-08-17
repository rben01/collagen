/**
 * Comprehensive tests for the filesystem module
 *
 * Tests path normalization, canonicalization, file system operations,
 * resource resolution, and all utility functions.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
	// Path utilities
	normalizedPathJoin,
	// File system
	BrowserInMemoryFileSystem,
	createFileSystem,
	type InMemoryFileSystem,
	// File reading
	readFileAsText,
	readFileAsBytes,
	// Manifest handling
	detectManifestFormat,
	getManifestPath,
	loadManifest,
	// Resource resolution
	resolveResourcePath,
	fetchResource,
	// Utility functions
	isImagePath,
	isFontPath,
	getFileExtension,
	getMimeType,
} from "../filesystem/index.js";
import { MissingFileError, MissingManifestError } from "../errors/index.js";

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

/** Create test file system with predefined files */
function createTestFiles(): Record<string, File> {
	return {
		"collagen.json": createMockFile(
			"collagen.json",
			'{"test": "value"}',
			"application/json",
		),
		"collagen.jsonnet": createMockFile(
			"collagen.jsonnet",
			"{ test: 'value' }",
			"text/plain",
		),
		"image.jpg": createMockBinaryFile(
			"image.jpg",
			[0xff, 0xd8, 0xff],
			"image/jpeg",
		),
		"font.woff2": createMockBinaryFile(
			"font.woff2",
			[0x77, 0x4f, 0x46, 0x32],
			"font/woff2",
		),
		"subdir/nested.png": createMockBinaryFile(
			"nested.png",
			[0x89, 0x50, 0x4e, 0x47],
			"image/png",
		),
		"README.md": createMockFile(
			"README.md",
			"# Test Project",
			"text/markdown",
		),
	};
}

// =============================================================================
// Path Utilities Tests
// =============================================================================

describe("Path Utilities", () => {
	describe("normalizedPathJoin", () => {
		it("should remove leading slashes", () => {
			expect(normalizedPathJoin("/path/to/file")).toBe("path/to/file");
			expect(normalizedPathJoin("///multiple/slashes")).toBe(
				"multiple/slashes",
			);
		});

		it("should convert backslashes to forward slashes", () => {
			expect(normalizedPathJoin("path\\to\\file")).toBe("path/to/file");
			expect(normalizedPathJoin("mixed/path\\with\\both")).toBe(
				"mixed/path/with/both",
			);
		});

		it("should remove duplicate slashes", () => {
			expect(normalizedPathJoin("path//to///file")).toBe("path/to/file");
			expect(normalizedPathJoin("//multiple////slashes//")).toBe(
				"multiple/slashes",
			);
		});

		it("should remove leading ./ references", () => {
			expect(normalizedPathJoin("./path/to/file")).toBe("path/to/file");
			expect(normalizedPathJoin("./relative")).toBe("relative");
		});

		it("should handle parent directory references", () => {
			expect(normalizedPathJoin("a/b/../c")).toBe("a/c");
			expect(normalizedPathJoin("a/../b")).toBe("b");
			expect(normalizedPathJoin("a/b/c/../../d")).toBe("a/d");
			expect(normalizedPathJoin("../a")).toBe("a");
			expect(normalizedPathJoin("../../a")).toBe("a");
		});

		it("should handle mixed current and parent directory references", () => {
			expect(normalizedPathJoin("a/./b/../c")).toBe("a/c");
			expect(normalizedPathJoin("./a/../b/./c")).toBe("b/c");
		});

		it("should remove trailing slash except for root", () => {
			expect(normalizedPathJoin("path/to/dir/")).toBe("path/to/dir");
			expect(normalizedPathJoin("/")).toBe("/");
		});

		it("should handle empty and root paths", () => {
			expect(normalizedPathJoin("")).toBe("/");
			expect(normalizedPathJoin("/")).toBe("/");
			expect(normalizedPathJoin("./")).toBe("/");
			expect(normalizedPathJoin("./.")).toBe("/");
		});

		it("should handle complex paths", () => {
			expect(normalizedPathJoin("//./path\\to/../file//")).toBe("path/file");
			expect(normalizedPathJoin("\\\\server\\share\\file")).toBe(
				"server/share/file",
			);
		});
	});

	describe("normalizedPathJoin", () => {
		it("should resolve relative paths correctly", () => {
			expect(normalizedPathJoin("base/path", "file.txt")).toBe(
				"base/path/file.txt",
			);
			expect(normalizedPathJoin("", "file.txt")).toBe("file.txt");
		});

		it("should handle parent directory references", () => {
			expect(normalizedPathJoin("base/path", "../file.txt")).toBe(
				"base/file.txt",
			);
			expect(normalizedPathJoin("base/path/deep", "../../file.txt")).toBe(
				"base/file.txt",
			);
		});

		it("should handle current directory references", () => {
			expect(normalizedPathJoin("base", "./file.txt")).toBe("base/file.txt");
			expect(normalizedPathJoin("base", "./sub/./file.txt")).toBe(
				"base/sub/file.txt",
			);
		});

		it("should handle complex path resolution", () => {
			expect(normalizedPathJoin("a/b/c", "../d/./e/../f")).toBe("a/b/d/f");
			expect(normalizedPathJoin("base", "sub/../other/./file")).toBe(
				"base/other/file",
			);
		});

		it("should handle going past root", () => {
			expect(normalizedPathJoin("base", "../../..")).toBe("/");
			expect(normalizedPathJoin("a", "../../../file")).toBe("file");
		});

		it("should handle empty components", () => {
			expect(normalizedPathJoin("base", "sub//file")).toBe("base/sub/file");
			expect(normalizedPathJoin("", "file//name")).toBe("file/name");
		});
	});

	describe("normalizedPathJoin", () => {
		it("should join paths correctly", () => {
			expect(normalizedPathJoin("base", "file.txt")).toBe("base/file.txt");
			expect(normalizedPathJoin("/base/", "/file.txt")).toBe(
				"base/file.txt",
			);
		});

		it("should handle empty paths", () => {
			expect(normalizedPathJoin("", "file.txt")).toBe("file.txt");
			expect(normalizedPathJoin("base", "")).toBe("base");
			expect(normalizedPathJoin("", "")).toBe("/");
		});

		it("should normalize both parts", () => {
			expect(normalizedPathJoin("//base//", "\\file.txt")).toBe(
				"base/file.txt",
			);
			expect(normalizedPathJoin("./base/", "./file.txt")).toBe(
				"base/file.txt",
			);
		});
	});

	describe("normalizedPathJoin", () => {
		it("should join multiple paths correctly", () => {
			expect(normalizedPathJoin("path", "to", "file")).toBe("path/to/file");
			expect(normalizedPathJoin("base", "sub", "file.txt")).toBe(
				"base/sub/file.txt",
			);
		});

		it("should handle empty paths", () => {
			expect(normalizedPathJoin()).toBe("/");
			expect(normalizedPathJoin("")).toBe("/");
			expect(normalizedPathJoin("", "", "")).toBe("/");
			expect(normalizedPathJoin("", "file", "")).toBe("file");
		});

		it("should discard empty components and '.' references", () => {
			expect(normalizedPathJoin("path", "", "to", "file")).toBe(
				"path/to/file",
			);
			expect(normalizedPathJoin(".", "path", ".", "file")).toBe("path/file");
			expect(normalizedPathJoin("path/./sub", "file")).toBe("path/sub/file");
		});

		it("should process '..' components with stack", () => {
			expect(normalizedPathJoin("path", "..", "other")).toBe("other");
			expect(normalizedPathJoin("base", "sub", "..", "file")).toBe(
				"base/file",
			);
			expect(normalizedPathJoin("a", "b", "c", "..", "..", "d")).toBe("a/d");
		});

		it("should handle '..' at the beginning", () => {
			expect(normalizedPathJoin("..", "file")).toBe("file");
			expect(normalizedPathJoin("..", "..", "file")).toBe("file");
			expect(normalizedPathJoin("..", "path", "file")).toBe("path/file");
		});

		it("should handle mixed separators", () => {
			expect(
				normalizedPathJoin("path\\with\\backslashes", "file/with/forward"),
			).toBe("path/with/backslashes/file/with/forward");
			expect(normalizedPathJoin("mixed/path\\separators", "file")).toBe(
				"mixed/path/separators/file",
			);
		});

		it("should handle complex path operations", () => {
			expect(normalizedPathJoin("base", "sub/../other", "./file")).toBe(
				"base/other/file",
			);
			expect(normalizedPathJoin("a/b/c", "../d", "./e/../f")).toBe(
				"a/b/d/f",
			);
			expect(normalizedPathJoin("./path", "../other", "file")).toBe(
				"other/file",
			);
		});

		it("should handle paths with duplicate separators", () => {
			expect(normalizedPathJoin("path//with//doubles", "file")).toBe(
				"path/with/doubles/file",
			);
			expect(normalizedPathJoin("base", "sub///file")).toBe("base/sub/file");
		});

		it("should handle single path elements", () => {
			expect(normalizedPathJoin("single")).toBe("single");
			expect(normalizedPathJoin("./single")).toBe("single");
			expect(normalizedPathJoin("../single")).toBe("single");
		});

		it("should handle edge cases", () => {
			expect(normalizedPathJoin("a", "b", "..", "..", "c")).toBe("c");
			expect(normalizedPathJoin(".", "..", ".", "file")).toBe("file");
			expect(normalizedPathJoin("//", "./", "../", "file")).toBe("file");
		});
	});
});

// =============================================================================
// File Reading Tests
// =============================================================================

describe("File Reading", () => {
	it("should read text files correctly", async () => {
		const file = createMockFile("test.txt", "Hello, World!");
		const result = await readFileAsText(file);
		expect(result).toBe("Hello, World!");
	});

	it("should read binary files correctly", async () => {
		const data = [0x48, 0x65, 0x6c, 0x6c, 0x6f]; // "Hello" in bytes
		const file = createMockBinaryFile("test.bin", data);
		const result = await readFileAsBytes(file);
		expect(result).toEqual(new Uint8Array(data));
	});

	it("should handle UTF-8 text correctly", async () => {
		const utf8Text = "Hello 🌍 World! 中文 العربية";
		const file = createMockFile("utf8.txt", utf8Text);
		const result = await readFileAsText(file);
		expect(result).toBe(utf8Text);
	});

	it("should handle empty files", async () => {
		const file = createMockFile("empty.txt", "");
		const text = await readFileAsText(file);
		const bytes = await readFileAsBytes(file);
		expect(text).toBe("");
		expect(bytes).toEqual(new Uint8Array(0));
	});
});

// =============================================================================
// File System Tests
// =============================================================================

describe("BrowserInMemoryFileSystem", () => {
	let fs: InMemoryFileSystem;
	let testFiles: Record<string, File>;

	beforeEach(() => {
		testFiles = createTestFiles();
		fs = new BrowserInMemoryFileSystem(testFiles);
	});

	describe("Constructor", () => {
		it("should accept Record<string, File>", () => {
			const fs = new BrowserInMemoryFileSystem(testFiles);
			expect(fs.getFileCount()).toBe(6);
		});

		it("should accept Map<string, File>", () => {
			const fileMap = new Map(Object.entries(testFiles));
			const fs = new BrowserInMemoryFileSystem(fileMap);
			expect(fs.getFileCount()).toBe(6);
		});

		it("should normalize paths during construction", () => {
			const fs = new BrowserInMemoryFileSystem({
				"/leading/slash.txt": testFiles["README.md"],
				"trailing/slash/": testFiles["README.md"],
				"double//slash.txt": testFiles["README.md"],
			});
			const paths = fs.getPaths();
			expect(paths).toContain("leading/slash.txt");
			expect(paths).toContain("trailing/slash");
			expect(paths).toContain("double/slash.txt");
		});
	});

	describe("exists", () => {
		it("should return true for existing files", () => {
			expect(fs.exists("collagen.json")).toBe(true);
			expect(fs.exists("subdir/nested.png")).toBe(true);
		});

		it("should return false for non-existing files", () => {
			expect(fs.exists("nonexistent.txt")).toBe(false);
			expect(fs.exists("subdir/missing.png")).toBe(false);
		});

		it("should handle path normalization", () => {
			expect(fs.exists("/collagen.json")).toBe(true);
			expect(fs.exists("./collagen.json")).toBe(true);
			expect(fs.exists("subdir//nested.png")).toBe(true);
		});
	});

	describe("load", () => {
		it("should load existing files", async () => {
			const content = await fs.load("collagen.json");
			expect(content.path).toBe("collagen.json");
			expect(content.bytes).toBeInstanceOf(Uint8Array);

			const text = new TextDecoder().decode(content.bytes);
			expect(text).toBe('{"test": "value"}');
		});

		it("should throw error for missing files", async () => {
			await expect(fs.load("nonexistent.txt")).rejects.toThrow(
				MissingFileError,
			);
		});

		it("should cache loaded files", async () => {
			const content1 = await fs.load("collagen.json");
			const content2 = await fs.load("collagen.json");
			expect(content1).toBe(content2); // Same reference due to caching
		});

		it("should handle path normalization", async () => {
			const content1 = await fs.load("collagen.json");
			const content2 = await fs.load("/collagen.json");
			const content3 = await fs.load("./collagen.json");
			expect(content1.path).toBe(content2.path);
			expect(content1.path).toBe(content3.path);
		});
	});

	describe("getPaths", () => {
		it("should return all file paths sorted", () => {
			const paths = fs.getPaths();
			expect(paths).toEqual([
				"README.md",
				"collagen.json",
				"collagen.jsonnet",
				"font.woff2",
				"image.jpg",
				"subdir/nested.png",
			]);
		});

		it("should return normalized paths", () => {
			const fs = new BrowserInMemoryFileSystem({
				"/path/with/leading.txt": testFiles["README.md"],
				"path\\with\\backslashes.txt": testFiles["README.md"],
			});
			const paths = fs.getPaths();
			expect(paths).toContain("path/with/leading.txt");
			expect(paths).toContain("path/with/backslashes.txt");
		});
	});

	describe("getTotalSize", () => {
		it("should return sum of all file sizes", () => {
			const totalSize = fs.getTotalSize();
			const expectedSize = Object.values(testFiles).reduce(
				(sum, file) => sum + file.size,
				0,
			);
			expect(totalSize).toBe(expectedSize);
		});

		it("should handle empty file system", () => {
			const emptyFs = new BrowserInMemoryFileSystem({});
			expect(emptyFs.getTotalSize()).toBe(0);
		});
	});

	describe("getFileCount", () => {
		it("should return number of files", () => {
			expect(fs.getFileCount()).toBe(6);
		});

		it("should handle empty file system", () => {
			const emptyFs = new BrowserInMemoryFileSystem({});
			expect(emptyFs.getFileCount()).toBe(0);
		});
	});
});

// =============================================================================
// Manifest Handling Tests
// =============================================================================

describe("Manifest Handling", () => {
	describe("detectManifestFormat", () => {
		it("should prefer jsonnet over json", () => {
			const fs = createFileSystem({
				"collagen.json": createMockFile("collagen.json", "{}"),
				"collagen.jsonnet": createMockFile("collagen.jsonnet", "{}"),
			});
			expect(detectManifestFormat(fs)).toBe("jsonnet");
		});

		it("should detect json when only json exists", () => {
			const fs = createFileSystem({
				"collagen.json": createMockFile("collagen.json", "{}"),
			});
			expect(detectManifestFormat(fs)).toBe("json");
		});

		it("should detect jsonnet when only jsonnet exists", () => {
			const fs = createFileSystem({
				"collagen.jsonnet": createMockFile("collagen.jsonnet", "{}"),
			});
			expect(detectManifestFormat(fs)).toBe("jsonnet");
		});

		it("should return null when no manifest exists", () => {
			const fs = createFileSystem({
				"other.txt": createMockFile("other.txt", "content"),
			});
			expect(detectManifestFormat(fs)).toBe(null);
		});
	});

	describe("getManifestPath", () => {
		it("should return correct paths for formats", () => {
			expect(getManifestPath("json")).toBe("collagen.json");
			expect(getManifestPath("jsonnet")).toBe("collagen.jsonnet");
		});
	});

	describe("loadManifest", () => {
		it("should load and parse JSON manifest", async () => {
			const fs = createFileSystem({
				"collagen.json": createMockFile(
					"collagen.json",
					'{"key": "value", "number": 42}',
				),
			});
			const result = await loadManifest(fs, "json");
			expect(result).toEqual({ key: "value", number: 42 });
		});

		it("should auto-detect format when not specified", async () => {
			const fs = createFileSystem({
				"collagen.json": createMockFile(
					"collagen.json",
					'{"auto": "detected"}',
				),
			});
			const result = await loadManifest(fs);
			expect(result).toEqual({ auto: "detected" });
		});

		it("should throw error for missing manifest", async () => {
			const fs = createFileSystem({
				"other.txt": createMockFile("other.txt", "not a manifest"),
			});
			await expect(loadManifest(fs)).rejects.toThrow(MissingManifestError);
		});

		it("should throw error for invalid JSON", async () => {
			const fs = createFileSystem({
				"collagen.json": createMockFile(
					"collagen.json",
					"{ invalid json }",
				),
			});
			await expect(loadManifest(fs, "json")).rejects.toThrow();
		});

		it("should handle UTF-8 content", async () => {
			const fs = createFileSystem({
				"collagen.json": createMockFile(
					"collagen.json",
					'{"unicode": "🌍 中文 العربية"}',
				),
			});
			const result = await loadManifest(fs, "json");
			expect(result).toEqual({ unicode: "🌍 中文 العربية" });
		});
	});
});

// =============================================================================
// Resource Resolution Tests
// =============================================================================

describe("Resource Resolution", () => {
	describe("resolveResourcePath", () => {
		it("should resolve relative paths", () => {
			expect(resolveResourcePath("base/path", "file.txt")).toBe(
				"base/path/file.txt",
			);
			expect(resolveResourcePath("", "file.txt")).toBe("file.txt");
		});

		it("should handle parent directory navigation", () => {
			expect(resolveResourcePath("base/path", "../other.txt")).toBe(
				"base/other.txt",
			);
			expect(resolveResourcePath("deep/nested/path", "../../file.txt")).toBe(
				"deep/file.txt",
			);
		});
	});

	describe("fetchResource", () => {
		it("should fetch existing resources", async () => {
			const fs = createFileSystem({
				"resource.txt": createMockFile("resource.txt", "resource content"),
			});
			const content = await fetchResource(fs, "resource.txt");
			expect(content.path).toBe("resource.txt");
			const text = new TextDecoder().decode(content.bytes);
			expect(text).toBe("resource content");
		});

		it("should throw error for missing resources", async () => {
			const fs = createFileSystem({});
			await expect(fetchResource(fs, "missing.txt")).rejects.toThrow(
				MissingFileError,
			);
		});

		it("should normalize resource paths", async () => {
			const fs = createFileSystem({
				"resource.txt": createMockFile("resource.txt", "content"),
			});
			const content = await fetchResource(fs, "/resource.txt");
			expect(content.path).toBe("resource.txt");
		});
	});
});

// =============================================================================
// Utility Functions Tests
// =============================================================================

describe("Utility Functions", () => {
	describe("createFileSystem", () => {
		it("should create file system from Record", () => {
			const files = { "test.txt": createMockFile("test.txt", "content") };
			const fs = createFileSystem(files);
			expect(fs.getFileCount()).toBe(1);
			expect(fs.exists("test.txt")).toBe(true);
		});

		it("should create file system from Map", () => {
			const files = new Map([
				["test.txt", createMockFile("test.txt", "content")],
			]);
			const fs = createFileSystem(files);
			expect(fs.getFileCount()).toBe(1);
			expect(fs.exists("test.txt")).toBe(true);
		});
	});

	describe("isImagePath", () => {
		it("should identify image file extensions", () => {
			expect(isImagePath("image.jpg")).toBe(true);
			expect(isImagePath("image.jpeg")).toBe(true);
			expect(isImagePath("image.png")).toBe(true);
			expect(isImagePath("image.gif")).toBe(true);
			expect(isImagePath("image.webp")).toBe(true);
			expect(isImagePath("image.bmp")).toBe(true);
			expect(isImagePath("image.svg")).toBe(true);
		});

		it("should handle case insensitive extensions", () => {
			expect(isImagePath("IMAGE.JPG")).toBe(true);
			expect(isImagePath("image.PNG")).toBe(true);
		});

		it("should reject non-image extensions", () => {
			expect(isImagePath("document.txt")).toBe(false);
			expect(isImagePath("font.woff")).toBe(false);
			expect(isImagePath("data.json")).toBe(false);
		});

		it("should handle paths with directories", () => {
			expect(isImagePath("assets/images/photo.jpg")).toBe(true);
			expect(isImagePath("path/to/icon.png")).toBe(true);
		});

		it("should handle files without extensions", () => {
			expect(isImagePath("filename")).toBe(false);
			expect(isImagePath("path/to/file")).toBe(false);
		});
	});

	describe("isFontPath", () => {
		it("should identify font file extensions", () => {
			expect(isFontPath("font.woff")).toBe(true);
			expect(isFontPath("font.woff2")).toBe(true);
			expect(isFontPath("font.ttf")).toBe(true);
			expect(isFontPath("font.otf")).toBe(true);
		});

		it("should handle case insensitive extensions", () => {
			expect(isFontPath("FONT.WOFF")).toBe(true);
			expect(isFontPath("font.TTF")).toBe(true);
		});

		it("should reject non-font extensions", () => {
			expect(isFontPath("image.jpg")).toBe(false);
			expect(isFontPath("document.txt")).toBe(false);
		});
	});

	describe("getFileExtension", () => {
		it("should extract file extensions", () => {
			expect(getFileExtension("file.txt")).toBe("txt");
			expect(getFileExtension("image.jpg")).toBe("jpg");
			expect(getFileExtension("script.js")).toBe("js");
		});

		it("should handle multiple dots", () => {
			expect(getFileExtension("file.test.js")).toBe("js");
			expect(getFileExtension("archive.tar.gz")).toBe("gz");
		});

		it("should handle paths with directories", () => {
			expect(getFileExtension("path/to/file.txt")).toBe("txt");
			expect(getFileExtension("deeply/nested/path/image.png")).toBe("png");
		});

		it("should return empty string for no extension", () => {
			expect(getFileExtension("filename")).toBe("");
			expect(getFileExtension("path/to/file")).toBe("");
		});

		it("should handle dots in directory names", () => {
			expect(getFileExtension("path.with.dots/filename")).toBe("");
			expect(getFileExtension("path.with.dots/file.txt")).toBe("txt");
		});
	});

	describe("getMimeType", () => {
		it("should return correct MIME types for images", () => {
			expect(getMimeType("image.jpg")).toBe("image/jpeg");
			expect(getMimeType("image.jpeg")).toBe("image/jpeg");
			expect(getMimeType("image.png")).toBe("image/png");
			expect(getMimeType("image.gif")).toBe("image/gif");
			expect(getMimeType("image.webp")).toBe("image/webp");
			expect(getMimeType("image.bmp")).toBe("image/bmp");
			expect(getMimeType("image.svg")).toBe("image/svg+xml");
		});

		it("should return correct MIME types for fonts", () => {
			expect(getMimeType("font.woff")).toBe("font/woff");
			expect(getMimeType("font.woff2")).toBe("font/woff2");
			expect(getMimeType("font.ttf")).toBe("font/ttf");
			expect(getMimeType("font.otf")).toBe("font/otf");
		});

		it("should handle case insensitive extensions", () => {
			expect(getMimeType("IMAGE.JPG")).toBe("image/jpeg");
			expect(getMimeType("font.WOFF2")).toBe("font/woff2");
		});

		it("should return default MIME type for unknown extensions", () => {
			expect(getMimeType("file.unknown")).toBe("application/octet-stream");
			expect(getMimeType("document.txt")).toBe("application/octet-stream");
		});

		it("should handle files without extensions", () => {
			expect(getMimeType("filename")).toBe("application/octet-stream");
		});
	});
});

// =============================================================================
// Edge Cases and Error Handling
// =============================================================================

describe("Edge Cases and Error Handling", () => {
	it("should handle very long paths", () => {
		const longFolder = "a/".repeat(100);
		expect(normalizedPathJoin(longFolder)).toBe(longFolder.slice(0, -1));

		const longerFolder = "a/////".repeat(100);
		expect(normalizedPathJoin(longerFolder)).toBe(longFolder.slice(0, -1));

		const longFile = "a/".repeat(100) + "file.txt";
		expect(normalizedPathJoin(longFile));

		const longerFile = "a/////".repeat(100) + "file.txt";
		expect(normalizedPathJoin(longerFile)).toBe(longFile);
	});

	it("should handle paths with special characters", () => {
		expect(normalizedPathJoin("path with spaces/file")).toBe(
			"path with spaces/file",
		);
		expect(normalizedPathJoin("path-with-dashes/file_with_underscores")).toBe(
			"path-with-dashes/file_with_underscores",
		);
		expect(normalizedPathJoin("path.with.dots/file")).toBe(
			"path.with.dots/file",
		);
	});

	it("should handle unicode paths", () => {
		expect(normalizedPathJoin("路径/文件.txt")).toBe("路径/文件.txt");
		expect(normalizedPathJoin("مجلد/ملف.txt")).toBe("مجلد/ملف.txt");
		expect(normalizedPathJoin("папка/файл.txt")).toBe("папка/файл.txt");
	});

	it("should handle empty file system operations", () => {
		const fs = createFileSystem({});
		expect(fs.getFileCount()).toBe(0);
		expect(fs.getTotalSize()).toBe(0);
		expect(fs.getPaths()).toEqual([]);
		expect(fs.exists("any")).toBe(false);
	});

	it("should handle large file operations", async () => {
		// Create a large mock file (1MB of 'A' characters)
		const largeContent = "A".repeat(1024 * 1024);
		const largeFile = createMockFile("large.txt", largeContent);
		const fs = createFileSystem({ "large.txt": largeFile });

		const content = await fs.load("large.txt");
		expect(content.bytes.length).toBe(1024 * 1024);
		expect(fs.getTotalSize()).toBe(largeFile.size);
	});
});
