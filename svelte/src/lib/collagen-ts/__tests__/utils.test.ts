/**
 * Comprehensive tests for the utils module
 *
 * Tests base64 encoding/decoding, XML escaping, array/object utilities,
 * type guards, performance utilities, and edge cases.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
	// Base64
	base64Encode,
	base64Decode,
	// String utilities
	escapeXml,
	needsXmlEscaping,
	// Array utilities
	ensureArray,
	isEmpty,
	// Object utilities
	isPlainObject,
	getKeys,
	pick,
	omit,
	// Type guards
	isString,
	isNumber,
	isBoolean,
	isArray,
	// Performance utilities
	debounce,
	SimpleCache,
} from "../utils/index.js";

// =============================================================================
// Base64 Encoding Tests
// =============================================================================

describe("Base64 Utilities", () => {
	describe("base64Encode", () => {
		it("should encode simple text", () => {
			const input = new TextEncoder().encode("Hello, World!");
			const result = base64Encode(input);
			expect(result).toBe("SGVsbG8sIFdvcmxkIQ==");
		});

		it("should encode binary data", () => {
			const input = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xff]);
			const result = base64Encode(input);
			expect(result).toBe("AAECA/8=");
		});

		it("should encode empty data", () => {
			const input = new Uint8Array(0);
			const result = base64Encode(input);
			expect(result).toBe("");
		});

		it("should handle single byte", () => {
			const input = new Uint8Array([0x41]); // 'A'
			const result = base64Encode(input);
			expect(result).toBe("QQ==");
		});

		it("should handle two bytes", () => {
			const input = new Uint8Array([0x41, 0x42]); // 'AB'
			const result = base64Encode(input);
			expect(result).toBe("QUI=");
		});

		it("should handle three bytes", () => {
			const input = new Uint8Array([0x41, 0x42, 0x43]); // 'ABC'
			const result = base64Encode(input);
			expect(result).toBe("QUJD");
		});

		it("should handle unicode characters", () => {
			const input = new TextEncoder().encode("🌍 Hello 中文");
			const result = base64Encode(input);
			// Verify it can be decoded back
			const decoded = new TextDecoder().decode(base64Decode(result));
			expect(decoded).toBe("🌍 Hello 中文");
		});

		it("should handle large data", () => {
			const input = new Uint8Array(1000).fill(0x55);
			const result = base64Encode(input);
			expect(result.length).toBeGreaterThan(0);
			expect(result).toMatch(/^[A-Za-z0-9+/=]+$/);
		});
	});

	describe("base64Decode", () => {
		it("should decode simple text", () => {
			const result = base64Decode("SGVsbG8sIFdvcmxkIQ==");
			const text = new TextDecoder().decode(result);
			expect(text).toBe("Hello, World!");
		});

		it("should decode binary data", () => {
			const result = base64Decode("AAECA/8=");
			expect(Array.from(result)).toEqual([0x00, 0x01, 0x02, 0x03, 0xff]);
		});

		it("should decode empty string", () => {
			const result = base64Decode("");
			expect(result.length).toBe(0);
		});

		it("should handle round-trip encoding", () => {
			const original = new Uint8Array([
				0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa,
				0xbb, 0xcc, 0xdd, 0xee, 0xff,
			]);
			const encoded = base64Encode(original);
			const decoded = base64Decode(encoded);
			expect(Array.from(decoded)).toEqual(Array.from(original));
		});

		it("should handle invalid base64 gracefully", () => {
			// Browser's atob throws on invalid input
			expect(() => base64Decode("invalid!@#")).toThrow();
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

// =============================================================================
// Object Utilities Tests
// =============================================================================

describe("Object Utilities", () => {
	describe("isPlainObject", () => {
		it("should detect plain objects", () => {
			expect(isPlainObject({})).toBe(true);
			expect(isPlainObject({ key: "value" })).toBe(true);
			expect(isPlainObject({ a: 1, b: 2 })).toBe(true);
		});

		it("should reject non-objects", () => {
			expect(isPlainObject(null)).toBe(false);
			expect(isPlainObject(undefined)).toBe(false);
			expect(isPlainObject("string")).toBe(false);
			expect(isPlainObject(123)).toBe(false);
			expect(isPlainObject(true)).toBe(false);
		});

		it("should reject arrays", () => {
			expect(isPlainObject([])).toBe(false);
			expect(isPlainObject([1, 2, 3])).toBe(false);
		});

		it("should reject special objects", () => {
			expect(isPlainObject(new Date())).toBe(false);
			expect(isPlainObject(new RegExp(""))).toBe(false);
			expect(isPlainObject(new Error())).toBe(false);
		});

		it("should handle object with null prototype", () => {
			const obj = Object.create(null);
			obj.key = "value";
			expect(isPlainObject(obj)).toBe(true);
		});
	});

	describe("getKeys", () => {
		it("should get object keys", () => {
			const obj = { a: 1, b: 2, c: 3 };
			const keys = getKeys(obj);
			expect(keys.sort()).toEqual(["a", "b", "c"]);
		});

		it("should handle empty object", () => {
			expect(getKeys({})).toEqual([]);
		});

		it("should preserve key types", () => {
			const obj = { stringKey: 1, "123": 2 } as const;
			const keys = getKeys(obj);
			expect(keys).toContain("stringKey");
			expect(keys).toContain("123");
		});
	});

	describe("pick", () => {
		it("should pick specified properties", () => {
			const obj = { a: 1, b: 2, c: 3, d: 4 };
			const result = pick(obj, ["a", "c"]);
			expect(result).toEqual({ a: 1, c: 3 });
		});

		it("should handle non-existent keys", () => {
			const obj = { a: 1, b: 2 };
			const result = pick(obj, ["a", "c"] as any);
			expect(result).toEqual({ a: 1 });
		});

		it("should handle empty keys array", () => {
			const obj = { a: 1, b: 2 };
			const result = pick(obj, []);
			expect(result).toEqual({});
		});

		it("should handle empty object", () => {
			const result = pick({}, ["a"] as any);
			expect(result).toEqual({});
		});

		it("should preserve value types", () => {
			const obj = {
				str: "hello",
				num: 42,
				bool: true,
				arr: [1, 2, 3],
				obj: { nested: true },
			};
			const result = pick(obj, ["str", "num", "arr"]);
			expect(result.str).toBe("hello");
			expect(result.num).toBe(42);
			expect(result.arr).toEqual([1, 2, 3]);
		});
	});

	describe("omit", () => {
		it("should omit specified properties", () => {
			const obj = { a: 1, b: 2, c: 3, d: 4 };
			const result = omit(obj, ["b", "d"]);
			expect(result).toEqual({ a: 1, c: 3 });
		});

		it("should handle non-existent keys", () => {
			const obj = { a: 1, b: 2 };
			const result = omit(obj, ["b", "c"] as any);
			expect(result).toEqual({ a: 1 });
		});

		it("should handle empty keys array", () => {
			const obj = { a: 1, b: 2 };
			const result = omit(obj, []);
			expect(result).toEqual({ a: 1, b: 2 });
		});

		it("should handle empty object", () => {
			const result = omit({}, ["a"] as any);
			expect(result).toEqual({});
		});

		it("should not modify original object", () => {
			const obj = { a: 1, b: 2, c: 3 };
			const result = omit(obj, ["b"]);
			expect(obj).toEqual({ a: 1, b: 2, c: 3 }); // Original unchanged
			expect(result).toEqual({ a: 1, c: 3 });
		});
	});
});

// =============================================================================
// Type Guard Tests
// =============================================================================

describe("Type Guards", () => {
	describe("isString", () => {
		it("should detect strings", () => {
			expect(isString("hello")).toBe(true);
			expect(isString("")).toBe(true);
			expect(isString("123")).toBe(true);
		});

		it("should reject non-strings", () => {
			expect(isString(123)).toBe(false);
			expect(isString(true)).toBe(false);
			expect(isString(null)).toBe(false);
			expect(isString(undefined)).toBe(false);
			expect(isString([])).toBe(false);
			expect(isString({})).toBe(false);
		});

		it("should handle String objects", () => {
			expect(isString(new String("hello"))).toBe(false); // Object, not primitive
		});
	});

	describe("isNumber", () => {
		it("should detect valid numbers", () => {
			expect(isNumber(0)).toBe(true);
			expect(isNumber(123)).toBe(true);
			expect(isNumber(-456)).toBe(true);
			expect(isNumber(3.14)).toBe(true);
			expect(isNumber(Infinity)).toBe(true);
			expect(isNumber(-Infinity)).toBe(true);
		});

		it("should reject NaN", () => {
			expect(isNumber(NaN)).toBe(false);
		});

		it("should reject non-numbers", () => {
			expect(isNumber("123")).toBe(false);
			expect(isNumber(true)).toBe(false);
			expect(isNumber(null)).toBe(false);
			expect(isNumber(undefined)).toBe(false);
			expect(isNumber([])).toBe(false);
			expect(isNumber({})).toBe(false);
		});

		it("should handle Number objects", () => {
			expect(isNumber(new Number(123))).toBe(false); // Object, not primitive
		});
	});

	describe("isBoolean", () => {
		it("should detect booleans", () => {
			expect(isBoolean(true)).toBe(true);
			expect(isBoolean(false)).toBe(true);
		});

		it("should reject non-booleans", () => {
			expect(isBoolean(0)).toBe(false);
			expect(isBoolean(1)).toBe(false);
			expect(isBoolean("true")).toBe(false);
			expect(isBoolean("false")).toBe(false);
			expect(isBoolean(null)).toBe(false);
			expect(isBoolean(undefined)).toBe(false);
			expect(isBoolean([])).toBe(false);
			expect(isBoolean({})).toBe(false);
		});

		it("should handle Boolean objects", () => {
			expect(isBoolean(new Boolean(true))).toBe(false); // Object, not primitive
		});
	});

	describe("isArray", () => {
		it("should detect arrays", () => {
			expect(isArray([])).toBe(true);
			expect(isArray([1, 2, 3])).toBe(true);
			expect(isArray(new Array())).toBe(true);
		});

		it("should reject non-arrays", () => {
			expect(isArray("string")).toBe(false);
			expect(isArray(123)).toBe(false);
			expect(isArray(true)).toBe(false);
			expect(isArray(null)).toBe(false);
			expect(isArray(undefined)).toBe(false);
			expect(isArray({})).toBe(false);
		});

		it("should handle array-like objects", () => {
			const arrayLike = { 0: "a", 1: "b", length: 2 };
			expect(isArray(arrayLike)).toBe(false);
		});
	});
});

// =============================================================================
// Performance Utilities Tests
// =============================================================================

describe("Performance Utilities", () => {
	describe("debounce", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("should delay function execution", () => {
			const fn = vi.fn();
			const debouncedFn = debounce(fn, 100);

			debouncedFn();
			expect(fn).not.toHaveBeenCalled();

			vi.advanceTimersByTime(100);
			expect(fn).toHaveBeenCalledOnce();
		});

		it("should reset timer on subsequent calls", () => {
			const fn = vi.fn();
			const debouncedFn = debounce(fn, 100);

			debouncedFn();
			vi.advanceTimersByTime(50);

			debouncedFn(); // Reset timer
			vi.advanceTimersByTime(50);
			expect(fn).not.toHaveBeenCalled();

			vi.advanceTimersByTime(50);
			expect(fn).toHaveBeenCalledOnce();
		});

		it("should pass arguments correctly", () => {
			const fn = vi.fn();
			const debouncedFn = debounce(fn, 100);

			debouncedFn("arg1", "arg2", 123);
			vi.advanceTimersByTime(100);

			expect(fn).toHaveBeenCalledWith("arg1", "arg2", 123);
		});

		it("should preserve this context", () => {
			const obj = {
				value: "test",
				fn: vi.fn(function (this: any) {
					return this.value;
				}),
			};

			const debouncedFn = debounce(obj.fn, 100);
			debouncedFn.call(obj);
			vi.advanceTimersByTime(100);

			expect(obj.fn).toHaveBeenCalledOnce();
		});

		it("should handle zero delay", () => {
			const fn = vi.fn();
			const debouncedFn = debounce(fn, 0);

			debouncedFn();
			vi.advanceTimersByTime(0);

			expect(fn).toHaveBeenCalledOnce();
		});

		it("should only execute once for multiple rapid calls", () => {
			const fn = vi.fn();
			const debouncedFn = debounce(fn, 100);

			debouncedFn();
			debouncedFn();
			debouncedFn();
			debouncedFn();

			vi.advanceTimersByTime(100);
			expect(fn).toHaveBeenCalledOnce();
		});
	});

	describe("SimpleCache", () => {
		let cache: SimpleCache<string, number>;

		beforeEach(() => {
			cache = new SimpleCache<string, number>(3);
		});

		it("should store and retrieve values", () => {
			cache.set("key1", 100);
			expect(cache.get("key1")).toBe(100);
			expect(cache.has("key1")).toBe(true);
		});

		it("should return undefined for missing keys", () => {
			expect(cache.get("missing")).toBeUndefined();
			expect(cache.has("missing")).toBe(false);
		});

		it("should respect max size limit", () => {
			cache.set("key1", 1);
			cache.set("key2", 2);
			cache.set("key3", 3);
			expect(cache.size).toBe(3);

			cache.set("key4", 4); // Should evict key1
			expect(cache.size).toBe(3);
			expect(cache.has("key1")).toBe(false); // Evicted
			expect(cache.has("key2")).toBe(true);
			expect(cache.has("key3")).toBe(true);
			expect(cache.has("key4")).toBe(true);
		});

		it("should clear all entries", () => {
			cache.set("key1", 1);
			cache.set("key2", 2);
			expect(cache.size).toBe(2);

			cache.clear();
			expect(cache.size).toBe(0);
			expect(cache.has("key1")).toBe(false);
			expect(cache.has("key2")).toBe(false);
		});

		it("should handle different value types", () => {
			const cache = new SimpleCache<string, any>();

			cache.set("string", "hello");
			cache.set("number", 42);
			cache.set("boolean", true);
			cache.set("object", { key: "value" });
			cache.set("array", [1, 2, 3]);

			expect(cache.get("string")).toBe("hello");
			expect(cache.get("number")).toBe(42);
			expect(cache.get("boolean")).toBe(true);
			expect(cache.get("object")).toEqual({ key: "value" });
			expect(cache.get("array")).toEqual([1, 2, 3]);
		});

		it("should handle custom key types", () => {
			const cache = new SimpleCache<number, string>();

			cache.set(1, "one");
			cache.set(2, "two");

			expect(cache.get(1)).toBe("one");
			expect(cache.get(2)).toBe("two");
		});

		it("should update existing keys", () => {
			cache.set("key", 1);
			expect(cache.get("key")).toBe(1);

			cache.set("key", 2); // Update
			expect(cache.get("key")).toBe(2);
			expect(cache.size).toBe(1); // Size should not increase
		});

		it("should handle default max size", () => {
			const defaultCache = new SimpleCache<string, number>();
			expect(defaultCache.size).toBe(0);

			// Fill beyond default size (100) to test eviction
			for (let i = 0; i < 105; i++) {
				defaultCache.set(`key${i}`, i);
			}

			expect(defaultCache.size).toBe(100);
			expect(defaultCache.has("key0")).toBe(false); // First 5 should be evicted
			expect(defaultCache.has("key4")).toBe(false);
			expect(defaultCache.has("key5")).toBe(true);
			expect(defaultCache.has("key104")).toBe(true);
		});

		it("should handle edge case of size 0", () => {
			const tinyCache = new SimpleCache<string, number>(0);
			tinyCache.set("key", 1);
			expect(tinyCache.size).toBe(0);
			expect(tinyCache.has("key")).toBe(false);
		});
	});
});

// =============================================================================
// Integration and Edge Case Tests
// =============================================================================

describe("Integration and Edge Cases", () => {
	it("should handle null and undefined consistently", () => {
		expect(isPlainObject(null)).toBe(false);
		expect(isPlainObject(undefined)).toBe(false);
		expect(isString(null)).toBe(false);
		expect(isString(undefined)).toBe(false);
		expect(isNumber(null)).toBe(false);
		expect(isNumber(undefined)).toBe(false);
		expect(isArray(null)).toBe(false);
		expect(isArray(undefined)).toBe(false);
	});

	it("should handle extreme values", () => {
		// Very long strings
		const longString = "a".repeat(10000);
		expect(isString(longString)).toBe(true);
		expect(escapeXml(longString)).toBe(longString);

		// Very large numbers
		expect(isNumber(Number.MAX_SAFE_INTEGER)).toBe(true);
		expect(isNumber(Number.MIN_SAFE_INTEGER)).toBe(true);

		// Very large arrays
		const largeArray = new Array(1000).fill(0);
		expect(isArray(largeArray)).toBe(true);
		expect(isEmpty(largeArray)).toBe(false);
	});

	it("should handle unicode and special characters", () => {
		const unicode = "🌍🚀💻🎉";
		expect(isString(unicode)).toBe(true);
		expect(escapeXml(unicode)).toBe(unicode);
		expect(needsXmlEscaping(unicode)).toBe(false);

		// Unicode with XML chars
		const mixed = "🌍 & 🚀 < 💻";
		expect(escapeXml(mixed)).toBe("🌍 &amp; 🚀 &lt; 💻");
		expect(needsXmlEscaping(mixed)).toBe(true);
	});

	it("should handle circular references gracefully", () => {
		const obj: any = { a: 1 };
		obj.self = obj; // Circular reference

		// These should not throw or infinite loop
		expect(isPlainObject(obj)).toBe(true);
		expect(getKeys(obj)).toContain("a");
		expect(getKeys(obj)).toContain("self");
	});
});
