/**
 * Utility functions for Collagen TypeScript implementation
 */

// =============================================================================
// Base64 Encoding
// =============================================================================

/** Encode bytes as base64 string using browser APIs */
export async function base64Encode(
	buffer: Uint8Array<ArrayBuffer>,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const blob = new Blob([buffer]);
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string; // readAsDataURL guarantees string type
			// Remove "data:application/octet-stream;base64," prefix
			const base64 = dataUrl.split(",", 2)[1];
			resolve(base64);
		};
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
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
