/**
 * Comprehensive tests for the utils module
 *
 * Tests base64 encoding/decoding, XML escaping, array/object utilities,
 * type guards, performance utilities, and edge cases.
 */

import { describe, it, expect } from "vitest";
import {
	// Base64
	base64Encode,
	// String utilities
	escapeXml,
	needsXmlEscaping,
	// Array utilities
	ensureArray,
	isEmpty,
} from "../utils/index.js";

// =============================================================================
// Base64 Encoding Tests
// =============================================================================

describe("Base64 Utilities", () => {
	describe("await base64Encode", () => {
		it("should encode simple text", async () => {
			const input = new TextEncoder().encode("Hello, World!");
			const result = await base64Encode(input);
			expect(result).toBe("SGVsbG8sIFdvcmxkIQ==");
		});

		it("should encode binary data", async () => {
			const input = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xff]);
			const result = await base64Encode(input);
			expect(result).toBe("AAECA/8=");
		});

		it("should encode empty data", async () => {
			const input = new Uint8Array(0);
			const result = await base64Encode(input);
			expect(result).toBe("");
		});

		it("should handle single byte", async () => {
			const input = new Uint8Array([0x41]); // 'A'
			const result = await base64Encode(input);
			expect(result).toBe("QQ==");
		});

		it("should handle two bytes", async () => {
			const input = new Uint8Array([0x41, 0x42]); // 'AB'
			const result = await base64Encode(input);
			expect(result).toBe("QUI=");
		});

		it("should handle three bytes", async () => {
			const input = new Uint8Array([0x41, 0x42, 0x43]); // 'ABC'
			const result = await base64Encode(input);
			expect(result).toBe("QUJD");
		});

		it("should handle unicode characters", async () => {
			const input = new TextEncoder().encode("🌍 Hello 中文");
			const result = await base64Encode(input);
			expect(result).toBe("8J+MjSBIZWxsbyDkuK3mloc=");
		});

		it("should handle large data", async () => {
			const input = new Uint8Array(1000).fill(0x55);
			const result = await base64Encode(input);
			expect(result.length).toBeGreaterThan(0);
			expect(result).toMatch(/^[A-Za-z0-9+/=]+$/);
		});
	});
});

// =============================================================================
// String Utilities Tests
// =============================================================================

describe("String Utilities", () => {
	describe("escapeXml", () => {
		it("should escape basic XML characters", () => {
			expect(escapeXml("&")).toBe("&amp;");
			expect(escapeXml("<")).toBe("&lt;");
			expect(escapeXml(">")).toBe("&gt;");
			expect(escapeXml('"')).toBe("&quot;");
			expect(escapeXml("'")).toBe("&#39;");
		});

		it("should escape multiple characters", () => {
			const input = "Hello & <World> \"test\" 'quote'";
			const expected =
				"Hello &amp; &lt;World&gt; &quot;test&quot; &#39;quote&#39;";
			expect(escapeXml(input)).toBe(expected);
		});

		it("should handle empty string", () => {
			expect(escapeXml("")).toBe("");
		});

		it("should handle string with no special characters", () => {
			const input = "Hello World 123 ABC";
			expect(escapeXml(input)).toBe(input);
		});

		it("should handle unicode characters", () => {
			const input = "Hello 🌍 & 中文 < test";
			const expected = "Hello 🌍 &amp; 中文 &lt; test";
			expect(escapeXml(input)).toBe(expected);
		});

		it("should escape in correct order", () => {
			// Ampersand should be escaped first to avoid double-escaping
			const input = "&lt;";
			const expected = "&amp;lt;";
			expect(escapeXml(input)).toBe(expected);
		});

		it("should handle repeated characters", () => {
			expect(escapeXml("&&&")).toBe("&amp;&amp;&amp;");
			expect(escapeXml("<<<")).toBe("&lt;&lt;&lt;");
			expect(escapeXml('"""')).toBe("&quot;&quot;&quot;");
		});
	});

	describe("needsXmlEscaping", () => {
		it("should detect characters that need escaping", () => {
			expect(needsXmlEscaping("&")).toBe(true);
			expect(needsXmlEscaping("<")).toBe(true);
			expect(needsXmlEscaping(">")).toBe(true);
			expect(needsXmlEscaping('"')).toBe(true);
			expect(needsXmlEscaping("'")).toBe(true);
		});

		it("should detect mixed content", () => {
			expect(needsXmlEscaping("Hello & World")).toBe(true);
			expect(needsXmlEscaping("Test <tag>")).toBe(true);
			expect(needsXmlEscaping('Say "hello"')).toBe(true);
		});

		it("should return false for safe text", () => {
			expect(needsXmlEscaping("Hello World")).toBe(false);
			expect(needsXmlEscaping("123 ABC xyz")).toBe(false);
			expect(needsXmlEscaping("🌍 Unicode")).toBe(false);
		});

		it("should handle empty string", () => {
			expect(needsXmlEscaping("")).toBe(false);
		});
	});
});

// =============================================================================
// Array Utilities Tests
// =============================================================================

describe("Array Utilities", () => {
	describe("ensureArray", () => {
		it("should wrap non-array values", () => {
			expect(ensureArray("hello")).toEqual(["hello"]);
			expect(ensureArray(42)).toEqual([42]);
			expect(ensureArray(true)).toEqual([true]);
			expect(ensureArray(null)).toEqual([null]);
			expect(ensureArray(undefined)).toEqual([undefined]);
		});

		it("should pass through arrays unchanged", () => {
			const array = [1, 2, 3];
			expect(ensureArray(array)).toBe(array); // Same reference
			expect(ensureArray([])).toEqual([]);
		});

		it("should handle objects", () => {
			const obj = { key: "value" };
			expect(ensureArray(obj)).toEqual([obj]);
		});

		it("should preserve array types", () => {
			const stringArray = ["a", "b"];
			const result = ensureArray(stringArray);
			expect(result).toBe(stringArray);
			expect(typeof result[0]).toBe("string");
		});
	});

	describe("isEmpty", () => {
		it("should detect empty arrays", () => {
			expect(isEmpty([])).toBe(true);
		});

		it("should detect non-empty arrays", () => {
			expect(isEmpty([1])).toBe(false);
			expect(isEmpty([1, 2, 3])).toBe(false);
			expect(isEmpty([""])).toBe(false); // Contains empty string
			expect(isEmpty([null])).toBe(false); // Contains null
			expect(isEmpty([undefined])).toBe(false); // Contains undefined
		});

		it("should handle different types", () => {
			expect(isEmpty([0])).toBe(false);
			expect(isEmpty([false])).toBe(false);
			expect(isEmpty([{}])).toBe(false);
		});
	});
});
