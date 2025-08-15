/**
 * Utility functions for Collagen TypeScript implementation
 */

// =============================================================================
// Base64 Encoding
// =============================================================================

/** Encode bytes as base64 string using browser APIs */
export function base64Encode(bytes: Uint8Array): string {
	// Use browser's built-in base64 encoding
	let binary = "";
	for (let i = 0, len = bytes.length; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

/** Decode base64 string to bytes */
export function base64Decode(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0, len = binary.length; i < len; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

// =============================================================================
// String Utilities
// =============================================================================

/** Escape XML special characters */
export function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** Check if text needs XML escaping */
export function needsXmlEscaping(text: string): boolean {
	return /[&<>"']/.test(text);
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

// =============================================================================
// Object Utilities
// =============================================================================

/** Check if a value is a plain object */
export function isPlainObject(
	value: unknown,
): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Get object keys with proper typing */
export function getKeys<T extends Record<string, unknown>>(
	obj: T,
): (keyof T)[] {
	return Object.keys(obj);
}

/** Pick specific properties from an object */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
	obj: T,
	keys: K[],
): Pick<T, K> {
	const result = {} as Pick<T, K>;
	for (const key of keys) {
		if (key in obj) {
			result[key] = obj[key];
		}
	}
	return result;
}

/** Omit specific properties from an object */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
	obj: T,
	keys: K[],
): Omit<T, K> {
	const result = { ...obj } as Omit<T, K>;
	for (const key of keys) {
		delete (result as any)[key];
	}
	return result;
}

// =============================================================================
// Type Guards
// =============================================================================

/** Type guard for string */
export function isString(value: unknown): value is string {
	return typeof value === "string";
}

/** Type guard for number */
export function isNumber(value: unknown): value is number {
	return typeof value === "number" && !isNaN(value);
}

/** Type guard for boolean */
export function isBoolean(value: unknown): value is boolean {
	return typeof value === "boolean";
}

/** Type guard for array */
export function isArray(value: unknown): value is unknown[] {
	return Array.isArray(value);
}

// =============================================================================
// Performance Utilities
// =============================================================================

/** Create a debounced function */
export function debounce<T extends (...args: any[]) => any>(
	func: T,
	wait: number,
): (...args: Parameters<T>) => void {
	let timeout: number | undefined;

	return function (this: any, ...args: Parameters<T>) {
		clearTimeout(timeout);
		timeout = window.setTimeout(() => func.apply(this, args), wait);
	};
}

/** Simple cache implementation */
export class SimpleCache<K, V> {
	private cache = new Map<K, V>();
	private maxSize: number;

	constructor(maxSize = 100) {
		this.maxSize = maxSize;
	}

	get(key: K): V | undefined {
		return this.cache.get(key);
	}

	set(key: K, value: V): void {
		if (this.cache.size >= this.maxSize) {
			// Remove oldest entry
			const firstKey = this.cache.keys().next().value!;
			this.cache.delete(firstKey);
		}
		this.cache.set(key, value);
	}

	has(key: K): boolean {
		return this.cache.has(key);
	}

	clear(): void {
		this.cache.clear();
	}

	get size(): number {
		return this.cache.size;
	}
}
