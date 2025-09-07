/**
 * Additional unit tests for utility functions that lacked coverage
 */

import { describe, it, expect } from "vitest";
import { getCommonPathPrefix, formatFileSize, KB, MB } from "../utils/index.js";

describe("getCommonPathPrefix", () => {
	it("returns parent for single path", () => {
		expect(getCommonPathPrefix(["a/b/c"])).toBe("a/b/c");
	});

	it("computes segment-wise common prefix", () => {
		expect(getCommonPathPrefix(["a/b", "a/c"])).toBe("a");
		expect(getCommonPathPrefix(["a/x/y", "a/x/z"])).toBe("a/x");
		expect(getCommonPathPrefix(["alpha/beta", "alpha/gamma/delta"])).toBe(
			"alpha",
		);
	});

	it("handles no common prefix", () => {
		expect(getCommonPathPrefix(["b", "a/c"])).toBe("");
	});

	it("ignores trailing delimiters in result", () => {
		expect(getCommonPathPrefix(["a/", "a/c"])).toBe("a");
	});

	it("supports custom delimiter", () => {
		expect(getCommonPathPrefix(["a.b.c", "a.b.d"], ".")).toBe("a.b");
	});
});

describe("formatFileSize", () => {
	it("formats bytes under 1KB", () => {
		expect(formatFileSize(0)).toBe("0B");
		expect(formatFileSize(512)).toBe("512B");
		expect(formatFileSize(KB - 1)).toBe(`${KB - 1}B`);
	});

	it("formats at KB boundary and above", () => {
		expect(formatFileSize(KB)).toBe("1KB");
		expect(formatFileSize(2 * KB + 123)).toBe("2KB");
	});

	it("formats at MB boundary and above with one decimal", () => {
		expect(formatFileSize(MB)).toBe("1.0MB");
		expect(formatFileSize(3 * MB + 256 * KB)).toBe("3.3MB");
	});
});
