/**
 * Utility functions for Collagen TypeScript implementation
 */

// =============================================================================
// Base64 Encoding
// =============================================================================

// TODO: replace with
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array/toBase64
// and
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array/fromBase64
// once stable

const B64_ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64Encode(buffer: Uint8Array<ArrayBuffer>) {
	const len = buffer.length;
	let out = "";
	let i = 0;

	// Main loop: 3 bytes -> 4 chars
	for (; i + 2 < len; i += 3) {
		const n = (buffer[i] << 16) | (buffer[i + 1] << 8) | buffer[i + 2];
		out += B64_ALPHABET[n >>> 18];
		out += B64_ALPHABET[(n >>> 12) & 63];
		out += B64_ALPHABET[(n >>> 6) & 63];
		out += B64_ALPHABET[n & 63];
	}

	// Remainder (1 or 2 bytes)
	if (i < len) {
		const remain = len - i;
		let n = buffer[i] << 16;
		if (remain === 2) n |= buffer[i + 1] << 8;

		out += B64_ALPHABET[n >>> 18];
		out += B64_ALPHABET[(n >>> 12) & 63];
		out += remain === 2 ? B64_ALPHABET[(n >>> 6) & 63] : "=";
		out += "=";
	}

	return out;
}

let B64_TABLE: Uint8Array<ArrayBuffer> | undefined;

export function base64Decode(b64: string): Uint8Array {
	// Create lookup table
	if (!B64_TABLE) {
		B64_TABLE = new Uint8Array(128);
		for (let i = 0; i < B64_ALPHABET.length; i++) {
			B64_TABLE[B64_ALPHABET.charCodeAt(i)] = i;
		}
		B64_TABLE["=".charCodeAt(0)] = 0;
	}

	b64 = b64.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
	const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
	// pad to multiple of 4
	if (b64.length % 4 !== 0) b64 += "=".repeat(4 - (b64.length % 4));

	const b64len = b64.length;
	const outLen = (b64len >> 2) * 3 - pad;
	const out = new Uint8Array(outLen);

	let outputIndex = 0;

	// Process groups of 4 characters
	for (let i = 0; i < b64len; i += 4) {
		const a = B64_TABLE[b64.charCodeAt(i)] || 0;
		const b = B64_TABLE[b64.charCodeAt(i + 1)] || 0;
		const c = B64_TABLE[b64.charCodeAt(i + 2)] || 0;
		const d = B64_TABLE[b64.charCodeAt(i + 3)] || 0;

		const combined = (a << 18) | (b << 12) | (c << 6) | d;

		if (outputIndex < outLen) out[outputIndex++] = (combined >> 16) & 0xff;
		if (outputIndex < outLen) out[outputIndex++] = (combined >> 8) & 0xff;
		if (outputIndex < outLen) out[outputIndex++] = combined & 0xff;
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
