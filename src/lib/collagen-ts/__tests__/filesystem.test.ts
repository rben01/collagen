/**
 * Comprehensive tests for the filesystem module
 *
 * Tests path normalization, canonicalization, file system operations,
 * resource resolution, and all utility functions.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
	normalizedPathJoin,
	type InMemoryFileSystem,
	// File reading
	readFileAsText,
	readFileAsBytes,
	getManifestPath,
	// Utility functions
	isImagePath,
	isFontPath,
	getFileExtension,
	getMimeType,
} from "../filesystem/index.js";
import { MissingFileError, MissingManifestError } from "../errors/index.js";
import {
	createFileSystem,
	toText,
	createFileFromBytes,
	createFileFromString,
} from "./test-utils.js";

// =============================================================================
// Test Utilities
// =============================================================================

/** Create test file system with predefined files */
function createTestFiles(): Record<string, string | File> {
	return {
		"collagen.json": '{"test": "value"}',
		"collagen.jsonnet": "{ test: 'value' }",
		"image.jpg": createFileFromBytes(
			new Uint8Array([0xff, 0xd8, 0xff]),
			"image.jpg",
			"image/jpeg",
		),
		"font.woff2": createFileFromBytes(
			new Uint8Array([0x77, 0x4f, 0x46, 0x32]),
			"font.woff2",
			"font/woff2",
		),
		"subdir/nested.png": createFileFromBytes(
			new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
			"nested.png",
			"image/png",
		),
		"README.md": "# Test Project",
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
			expect(normalizedPathJoin("/")).toBe(".");
		});

		it("should handle empty and root paths", () => {
			expect(normalizedPathJoin()).toBe(".");
			expect(normalizedPathJoin("")).toBe(".");
			expect(normalizedPathJoin("/")).toBe(".");
			expect(normalizedPathJoin("./")).toBe(".");
			expect(normalizedPathJoin("./.")).toBe(".");
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
			expect(normalizedPathJoin("base", "../../..")).toBe(".");
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
			expect(normalizedPathJoin("", "")).toBe(".");
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
			expect(normalizedPathJoin()).toBe(".");
			expect(normalizedPathJoin("")).toBe(".");
			expect(normalizedPathJoin("", "", "")).toBe(".");
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
		const file = createFileFromString("Hello, World!", "test.txt");
		const result = await readFileAsText(file);
		expect(result).toBe("Hello, World!");
	});

	it("should read binary files correctly", async () => {
		const data = [0x48, 0x65, 0x6c, 0x6c, 0x6f]; // "Hello" in bytes
		const file = createFileFromBytes(new Uint8Array(data), "test.bin");
		const result = await readFileAsBytes(file);
		expect(result).toEqual(new Uint8Array(data));
	});

	it("should handle UTF-8 text correctly", async () => {
		const utf8Text = "Hello 🌍 World! 中文 العربية";
		const file = createFileFromString(utf8Text, "utf8.txt");
		const result = await readFileAsText(file);
		expect(result).toBe(utf8Text);
	});

	it("should handle empty files", async () => {
		const file = createFileFromString("", "empty.txt");
		const text = await readFileAsText(file);
		const bytes = await readFileAsBytes(file);
		expect(text).toBe("");
		expect(bytes).toEqual(new Uint8Array(0));
	});
});

// =============================================================================
// File System Tests
// =============================================================================

describe("InMemoryFileSystem", () => {
	let fs: InMemoryFileSystem;
	let testFiles: Record<string, string | File>;

	beforeEach(async () => {
		testFiles = createTestFiles();
		fs = await createFileSystem(testFiles);
	});

	describe("Constructor", () => {
		it("should accept Map<string, File>", async () => {
			const fileMap = new Map(Object.entries(testFiles));
			const fs = await createFileSystem(fileMap);
			expect(fs.getFileCount()).toBe(6);
		});

		it("should normalize paths during construction", async () => {
			const fs = await createFileSystem({
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
			expect(fs.has("collagen.json")).toBe(true);
			expect(fs.has("subdir/nested.png")).toBe(true);
		});

		it("should return false for non-existing files", () => {
			expect(fs.has("nonexistent.txt")).toBe(false);
			expect(fs.has("subdir/missing.png")).toBe(false);
		});

		it("should handle path normalization", () => {
			expect(fs.has("/collagen.json")).toBe(true);
			expect(fs.has("./collagen.json")).toBe(true);
			expect(fs.has("subdir//nested.png")).toBe(true);
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

		it("should throw error for missing files", () => {
			expect(() => fs.load("nonexistent.txt")).toThrow(MissingFileError);
		});

		it("should return same content for repeated loads", async () => {
			const content1 = fs.load("collagen.json");
			const content2 = fs.load("collagen.json");
			expect(content1).toBe(content2); // Same reference since eagerly loaded
		});

		it("should handle path normalization", async () => {
			const content1 = fs.load("collagen.json");
			const content2 = fs.load("/collagen.json");
			const content3 = fs.load("./collagen.json");
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

		it("should return normalized paths", async () => {
			const fs = await createFileSystem({
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
			// Note: Now returns actual byte length, which should equal the file sizes in our test case
			const expectedSize = Object.values(testFiles).reduce(
				(sum, file) =>
					sum + (typeof file === "string" ? file.length : file.size),
				0,
			);
			expect(totalSize).toBe(expectedSize);
		});

		it("should handle empty file system", async () => {
			const emptyFs = await createFileSystem({});
			expect(emptyFs.getTotalSize()).toBe(0);
		});
	});

	describe("getFileCount", () => {
		it("should return number of files", () => {
			expect(fs.getFileCount()).toBe(6);
		});

		it("should handle empty file system", async () => {
			const emptyFs = await createFileSystem({});
			expect(emptyFs.getFileCount()).toBe(0);
		});
	});
});

// =============================================================================
// Manifest Handling Tests
// =============================================================================

describe("Manifest Handling", () => {
	describe("detectManifestFormat", () => {
		it("should prefer jsonnet over json", async () => {
			const fs = await createFileSystem({
				"collagen.json": "{}",
				"collagen.jsonnet": "{}",
			});
			const { format, content } = fs.loadManifestContents();
			expect(format).toBe("jsonnet");
			expect(toText(content)).toBe("{}");
		});

		it("should detect json when only json exists", async () => {
			const fs = await createFileSystem({ "collagen.json": "{}" });
			const { format, content } = fs.loadManifestContents();
			expect(format).toBe("json");
			expect(toText(content)).toBe("{}");
		});

		it("should detect jsonnet when only jsonnet exists", async () => {
			const fs = await createFileSystem({ "collagen.jsonnet": "{}" });
			const { format, content } = fs.loadManifestContents();
			expect(format).toBe("jsonnet");
			expect(toText(content)).toBe("{}");
		});

		it("should throw when no manifest exists", async () => {
			const fs = await createFileSystem({ "other.txt": "content" });
			expect(fs.loadManifestContents).toThrow();
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
			const fs = await createFileSystem({
				"collagen.json": '{"key": "value", "number": 42}',
			});
			const result = await fs.generateUntypedObject();
			expect(result).toEqual({ key: "value", number: 42 });
		});

		it("should auto-detect format when not specified", async () => {
			const fs = await createFileSystem({
				"collagen.json": '{"auto": "detected"}',
			});
			const result = await fs.generateUntypedObject();
			expect(result).toEqual({ auto: "detected" });
		});

		it("should throw error for missing manifest", async () => {
			const fs = await createFileSystem({ "other.txt": "not a manifest" });
			await expect(fs.generateUntypedObject()).rejects.toThrow(
				MissingManifestError,
			);
		});

		it("should throw error for invalid JSON", async () => {
			const fs = await createFileSystem({
				"collagen.json": "{ invalid json }",
			});
			await expect(fs.generateUntypedObject()).rejects.toThrow();
		});

		it("should handle UTF-8 content", async () => {
			const fs = await createFileSystem({
				"collagen.json": '{"unicode": "🌍 中文 العربية"}',
			});
			const result = await fs.generateUntypedObject();
			expect(result).toEqual({ unicode: "🌍 中文 العربية" });
		});
	});

	describe("mergeFiles", () => {
		it("should add new files to existing filesystem", async () => {
			// Create initial filesystem with one file
			const fs = await createFileSystem({
				"collagen.json": '{"initial": "file"}',
				"file1.txt": "content1",
			});

			expect(fs.getFileCount()).toBe(2);
			expect(fs.has("file1.txt")).toBe(true);
			expect(fs.has("file2.txt")).toBe(false);

			// Create new files to merge
			const newFiles = new Map<string, File>([
				["file2.txt", createFileFromString("content2", "file2.txt")],
				["file3.txt", createFileFromString("content3", "file3.txt")],
			]);

			// Merge new files
			await fs.mergeFiles(newFiles);

			expect(fs.getFileCount()).toBe(4);
			expect(fs.has("file1.txt")).toBe(true);
			expect(fs.has("file2.txt")).toBe(true);
			expect(fs.has("file3.txt")).toBe(true);
			expect(toText(fs.load("file2.txt"))).toBe("content2");
			expect(toText(fs.load("file3.txt"))).toBe("content3");
		});

		it("should replace existing files with same path", async () => {
			// Create initial filesystem
			const fs = await createFileSystem({
				"collagen.json": '{"test": "value"}',
				"shared.txt": "original content",
			});

			expect(toText(fs.load("shared.txt"))).toBe("original content");

			// Create new file with same path
			const newFiles = new Map<string, File>([
				[
					"shared.txt",
					createFileFromString("updated content", "shared.txt"),
				],
			]);

			// Merge - should replace the existing file
			await fs.mergeFiles(newFiles);

			expect(fs.getFileCount()).toBe(2); // Same count
			expect(toText(fs.load("shared.txt"))).toBe("updated content");
		});
	});

	describe("removeFile", () => {
		it("should remove existing files and return the File object", async () => {
			// Create initial filesystem
			const fs = await createFileSystem({
				"collagen.json": '{"test": "value"}',
				"file1.txt": "content1",
				"file2.txt": "content2",
			});

			expect(fs.getFileCount()).toBe(3);
			expect(fs.has("file1.txt")).toBe(true);

			// Remove a file
			const removedFile = fs.removeFile("file1.txt");

			// Should return the original File object
			expect(removedFile).toBeInstanceOf(File);
			expect(removedFile!.name).toBe("file1.txt");

			// File should be removed from filesystem
			expect(fs.getFileCount()).toBe(2);
			expect(fs.has("file1.txt")).toBe(false);
			expect(fs.has("file2.txt")).toBe(true);
			expect(fs.has("collagen.json")).toBe(true);
		});

		it("should return undefined for non-existent files", async () => {
			const fs = await createFileSystem({
				"collagen.json": '{"test": "value"}',
			});

			const result = fs.removeFile("nonexistent.txt");
			expect(result).toBeUndefined();
			expect(fs.getFileCount()).toBe(1); // No change
		});

		it("should handle path normalization when removing files", async () => {
			const fs = await createFileSystem({
				"subdir/nested.txt": "nested content",
			});

			expect(fs.has("subdir/nested.txt")).toBe(true);

			// Remove with different path formats
			const removedFile = fs.removeFile("/subdir//nested.txt");

			expect(removedFile).toBeInstanceOf(File);
			expect(fs.has("subdir/nested.txt")).toBe(false);
			expect(fs.getFileCount()).toBe(0);
		});

		it("should handle removing manifest files without special treatment", async () => {
			const fs = await createFileSystem({
				"collagen.json": '{"test": "value"}',
				"collagen.jsonnet": '{ test: "jsonnet" }',
				"other.txt": "other content",
			});

			// Remove JSON manifest
			const removedJsonFile = fs.removeFile("collagen.json");
			expect(removedJsonFile).toBeInstanceOf(File);
			expect(fs.has("collagen.json")).toBe(false);
			expect(fs.getFileCount()).toBe(2);

			// Remove Jsonnet manifest
			const removedJsonnetFile = fs.removeFile("collagen.jsonnet");
			expect(removedJsonnetFile).toBeInstanceOf(File);
			expect(fs.has("collagen.jsonnet")).toBe(false);
			expect(fs.getFileCount()).toBe(1);

			// Other file should still exist
			expect(fs.has("other.txt")).toBe(true);
		});

		it("should update file count and total size after removal", async () => {
			const fs = await createFileSystem({
				"small.txt": "small",
				"large.txt": "A".repeat(1000),
			});

			const initialCount = fs.getFileCount();
			const initialSize = fs.getTotalSize();

			const removedFile = fs.removeFile("large.txt");

			expect(removedFile).toBeInstanceOf(File);
			expect(fs.getFileCount()).toBe(initialCount - 1);
			expect(fs.getTotalSize()).toBeLessThan(initialSize);
			expect(fs.getTotalSize()).toBe("small".length); // Only small.txt remains
		});

		it("should handle removing files with special characters in paths", async () => {
			const fs = await createFileSystem({
				"file with spaces.txt": "content with spaces",
				"path-with-dashes/file_with_underscores.txt": "underscore content",
			});

			const removedFile1 = fs.removeFile("file with spaces.txt");
			expect(removedFile1).toBeInstanceOf(File);
			expect(fs.has("file with spaces.txt")).toBe(false);

			const removedFile2 = fs.removeFile(
				"path-with-dashes/file_with_underscores.txt",
			);
			expect(removedFile2).toBeInstanceOf(File);
			expect(fs.has("path-with-dashes/file_with_underscores.txt")).toBe(
				false,
			);
		});
	});
});

// =============================================================================
// Resource Resolution Tests
// =============================================================================

describe("Resource Resolution", () => {
	describe("normalizedPathJoin", () => {
		it("should resolve relative paths", () => {
			expect(normalizedPathJoin("base/path", "file.txt")).toBe(
				"base/path/file.txt",
			);
			expect(normalizedPathJoin("", "file.txt")).toBe("file.txt");
		});

		it("should handle parent directory navigation", () => {
			expect(normalizedPathJoin("base/path", "../other.txt")).toBe(
				"base/other.txt",
			);
			expect(normalizedPathJoin("deep/nested/path", "../../file.txt")).toBe(
				"deep/file.txt",
			);
		});
	});

	describe("fetchResource", () => {
		it("should fetch existing resources", async () => {
			const fs = await createFileSystem({
				"resource.txt": "resource content",
			});
			const content = await fs.load("resource.txt");
			expect(content.path).toBe("resource.txt");
			const text = new TextDecoder().decode(content.bytes);
			expect(text).toBe("resource content");
		});

		it("should throw error for missing resources", async () => {
			const fs = await createFileSystem({});
			await expect(() => fs.load("missing.txt")).toThrow(MissingFileError);
		});

		it("should normalize resource paths", async () => {
			const fs = await createFileSystem({ "resource.txt": "content" });
			const content = await fs.load("/resource.txt");
			expect(content.path).toBe("resource.txt");
		});
	});
});

// =============================================================================
// Utility Functions Tests
// =============================================================================

describe("Utility Functions", () => {
	describe("createFileSystem", () => {
		it("should create file system from Record", async () => {
			const files = { "test.txt": "content" };
			const fs = await createFileSystem(files);
			expect(fs.getFileCount()).toBe(1);
			expect(fs.has("test.txt")).toBe(true);
		});

		it("should create file system from Map", async () => {
			const files = new Map([["test.txt", "content"]]);
			const fs = await createFileSystem(files);
			expect(fs.getFileCount()).toBe(1);
			expect(fs.has("test.txt")).toBe(true);
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

	it("should handle empty file system operations", async () => {
		const fs = await createFileSystem({});
		expect(fs.getFileCount()).toBe(0);
		expect(fs.getTotalSize()).toBe(0);
		expect(fs.getPaths()).toEqual([]);
		expect(fs.has("any")).toBe(false);
	});

	it("should handle large file operations", async () => {
		// Create a large mock file (1MB of 'A' characters)
		const largeContent = "A".repeat(1024 * 1024);
		const largeFile = createFileFromString(largeContent, "large.txt");
		const fs = await createFileSystem({ "large.txt": largeFile });

		const content = await fs.load("large.txt");
		expect(content.bytes.length).toBe(1024 * 1024);
		// Note: getTotalSize now returns the actual byte length, not File.size
		expect(fs.getTotalSize()).toBe(1024 * 1024);
	});
});
