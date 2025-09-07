/**
 * Unit tests for upload helper functions used by the UI
 */

import { describe, it, expect } from "vitest";
import {
	getRootFolderName,
	stripFolderPrefix,
} from "../../../routes/upload-helpers.js";

describe("getRootFolderName", () => {
	it("returns parent folder for single path", () => {
		expect(getRootFolderName(["a/b/c.txt"])).toBe("a/b");
		expect(getRootFolderName(["single.txt"])).toBe("");
	});

	it("uses common prefix for multiple paths", () => {
		expect(getRootFolderName(["a/x.txt", "a/y/z.txt"])).toBe("a");
		expect(getRootFolderName(["/a/b/file", "/a/b/other.txt"])).toBe("/a/b");
		expect(getRootFolderName(["/a/b/folder", "/a/b/folder/file"])).toBe(
			"/a/b/folder",
		);
		expect(getRootFolderName(["/a/b/folder/", "/a/b/folder/file"])).toBe(
			"/a/b/folder",
		);
		expect(getRootFolderName(["/a/b/file", "/a/b/file2"])).toBe("/a/b");
		expect(getRootFolderName(["/a/b/file/", "/a/b/file2"])).toBe("/a/b");
		expect(getRootFolderName(["/a/b/file", "/a/b/file2/"])).toBe("/a/b");
	});

	it("can handle redundant path separators (not normalized)", () => {
		expect(getRootFolderName(["//a//b///c.txt"])).toBe("//a//b//");
		expect(getRootFolderName(["//a//b///c.txt", "//a//b//"])).toBe("//a//b/");
		expect(getRootFolderName(["//a//b///c.txt", "//a//b///"])).toBe(
			"//a//b//",
		);
		expect(getRootFolderName(["//a//b///c.txt", "//a//b///c.txt"])).toBe(
			"//a//b//",
		);
	});

	it("edge cases", () => {
		expect(getRootFolderName([])).toBe("");
		expect(getRootFolderName([""])).toBe("");
		expect(getRootFolderName(["/"])).toBe("");
		expect(getRootFolderName(["/", "/"])).toBe("");
		expect(getRootFolderName(["//", "//"])).toBe("/");
		expect(getRootFolderName(["////"])).toBe("///");
		expect(getRootFolderName(["/a", ""])).toBe("");
		expect(getRootFolderName(["/a", "a"])).toBe("");
		expect(getRootFolderName(["/a", "/"])).toBe("");
	});
});

describe("stripFolderPrefix", () => {
	function f(name: string) {
		return new File([""], name);
	}

	it("strips provided root when all paths share it", () => {
		const files = new Map<string, File>([
			["project/file1.txt", f("file1.txt")],
			["project/sub/file2.txt", f("file2.txt")],
		]);
		const out = stripFolderPrefix(files, "project");
		// Implementation keeps leading slash after stripping
		expect(Array.from(out.keys()).sort()).toEqual(
			["/file1.txt", "/sub/file2.txt"].sort(),
		);
	});

	it("returns original map unchanged if any path doesn't share root", () => {
		const files = new Map<string, File>([
			["project/file1.txt", f("file1.txt")],
			["other/file2.txt", f("file2.txt")],
		]);
		const out = stripFolderPrefix(files, "project");
		expect(out).toBe(files);
	});
});
