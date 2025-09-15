/**
 * Utility functions for Collagen TypeScript implementation
 */

// =============================================================================
// Base64 Encoding
// =============================================================================

const BASE64_ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function base64Encode(buffer: Uint8Array<ArrayBuffer>) {
	const len = buffer.length;
	let out = "";
	let i = 0;

	// Main loop: 3 bytes -> 4 chars
	for (; i + 2 < len; i += 3) {
		const n = (buffer[i] << 16) | (buffer[i + 1] << 8) | buffer[i + 2];
		out += BASE64_ALPHABET[n >>> 18];
		out += BASE64_ALPHABET[(n >>> 12) & 63];
		out += BASE64_ALPHABET[(n >>> 6) & 63];
		out += BASE64_ALPHABET[n & 63];
	}

	// Remainder (1 or 2 bytes)
	if (i < len) {
		const remain = len - i;
		let n = buffer[i] << 16;
		if (remain === 2) n |= buffer[i + 1] << 8;

		out += BASE64_ALPHABET[n >>> 18];
		out += BASE64_ALPHABET[(n >>> 12) & 63];
		out += remain === 2 ? BASE64_ALPHABET[(n >>> 6) & 63] : "=";
		out += "=";
	}

	return out;
}

// =============================================================================
// String Utilities
// =============================================================================

/** Escape XML special characters */
export function escapeXml(text: string): string {
	const replacer = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#39;",
	};
	return text.replace(/&|<|>|"|'/g, m => replacer[m as keyof typeof replacer]);
}

/** Check if text needs XML escaping */
export function needsXmlEscaping(text: string): boolean {
	return /[&<>"']/.test(text);
}

/**
 * Longest common prefix in terms of delimiter-separated segments. Never includes a
 * trailing delimiter.
 *
 * Precondition: the strings have already had `normalizedPathJoin` called on them
 *
 * Examples:
 * - getCommonPathPrefix(["a/b", "a/c"])    -> "a"
 * - getCommonPathPrefix(["a", "a/c"])      -> "a"
 * - getCommonPathPrefix(["b", "a/c"])      -> ""
 * - getCommonPathPrefix(["/a/b", "/a/c"])  -> "/a"
 * - getCommonPathPrefix(["a/", "a/c"])     -> "a"
 *
 * @param strs
 * @param delimiter - string of length exactly one (default "/")
 */
export function getCommonPathPrefix(strs: string[], delimiter = "/") {
	const nStrs = strs.length;
	if (nStrs <= 1) {
		return strs[0] ?? "";
	}

	const firstStr = strs[0];
	const strLen = firstStr.length;

	// index of the character before the last delimiter seen
	let beforeLastDelimiterPos = -1;

	for (let i = 0, len = strLen; i < len; i++) {
		const c = firstStr.charAt(i);

		// if any string differs at char i, return slice up to the last delimiter
		// (exclusive)
		for (let j = 1; j < nStrs; j++) {
			if (strs[j].charAt(i) !== c) {
				return firstStr.slice(0, beforeLastDelimiterPos + 1);
			}
		}

		// otherwise, if every string has the delimiter at i, move beforeLastDelimiterPos
		// up to just before it (stays at -1 if all strings have the delimiter at index
		// 0)
		if (c === delimiter) {
			beforeLastDelimiterPos = i - 1;
		}
	}

	// if we get here, all strings have firstStr as a prefix. firstStr itself is the
	// common path prefix if every other string has the delimiter as its next character.
	// otherwise the common path prefix is only up to the last delimiter (exclusive),
	// e.g.
	// - ["a/b", "a/b/c"] => "a/b"  // next char is '/'
	// - ["a/b/", "a/b/c"] => "a/b" // next char is 'c'
	// - ["a/b", "a/bat"] => "a"    // next char is 'a'

	for (let j = 1; j < nStrs; j++) {
		if (strs[j].charAt(strLen) !== delimiter) {
			return firstStr.slice(0, beforeLastDelimiterPos + 1);
		}
	}

	return firstStr;
}

// =============================================================================
// File Size Utilities
// =============================================================================

export const KB = 1024;
export const MB = 1024 * KB;

export function formatFileSize(bytes: number): string {
	if (bytes >= MB) {
		return `${(bytes / MB).toFixed(1)}MB`;
	} else if (bytes >= KB) {
		return `${(bytes / KB).toFixed(0)}KB`;
	} else {
		return `${bytes}B`;
	}
}

// =============================================================================
// Array Utilities
// =============================================================================

/** Ensure a value is an array */
export function ensureArray<T>(value: T | T[]): T[] {
	return Array.isArray(value) ? value : [value];
}

/** Check if an array is empty */
export function isEmpty<T>(array: T[]): boolean {
	return array.length === 0;
}
