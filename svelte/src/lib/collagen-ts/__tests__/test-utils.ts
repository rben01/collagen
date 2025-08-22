/**
 * Test utilities for Collagen TypeScript tests
 *
 * This module provides helper functions for testing the TypeScript implementation
 * against the expected outputs from the Rust implementation.
 */

import { expect } from "vitest";
import type { InMemoryFileSystem } from "../filesystem/index.js";
import { createFileSystem } from "../filesystem/index.js";

// =============================================================================
// Test Data Creation
// =============================================================================

/** Create a File object from string content */
export function createFileFromString(
	content: string,
	filename: string,
	mimeType = "text/plain",
): File {
	const blob = new Blob([content], { type: mimeType });
	return new File([blob], filename, { type: mimeType });
}

/** Create a File object from binary data */
export function createFileFromBytes(
	bytes: Uint8Array,
	filename: string,
	mimeType = "application/octet-stream",
): File {
	const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
	return new File([blob], filename, { type: mimeType });
}

/** Create a simple file system from content map */
export async function createTestFileSystem(
	files: Record<string, string | Uint8Array>,
): Promise<InMemoryFileSystem> {
	const fileMap = new Map<string, File>();

	for (const [path, content] of Object.entries(files)) {
		let file: File;
		if (typeof content === "string") {
			file = createFileFromString(content, path.split("/").pop() || path);
		} else {
			file = createFileFromBytes(content, path.split("/").pop() || path);
		}
		fileMap.set(path, file);
	}

	return await createFileSystem(fileMap);
}

// =============================================================================
// SVG Comparison Utilities
// =============================================================================

/** Normalize SVG content for comparison */
export function normalizeSvg(svg: string): string {
	return svg
		.trim()
		.replace(/\s+/g, " ") // Normalize whitespace
		.replace(/>\s+</g, "><") // Remove whitespace between tags
		.replace(/\s+\/>/g, "/>") // Normalize self-closing tags
		.replace(/\s+>/g, ">"); // Remove trailing spaces in tags
}

/** Compare two SVG strings for equivalence */
export function expectSvgEqual(actual: string, expected: string): void {
	const normalizedActual = normalizeSvg(actual);
	const normalizedExpected = normalizeSvg(expected);

	expect(normalizedActual).toBe(normalizedExpected);
}

/** Compare SVG with tolerance for minor differences */
export function expectSvgSimilar(actual: string, expected: string): void {
	// For now, just do exact comparison
	// Can be enhanced later to handle minor formatting differences
	expectSvgEqual(actual, expected);
}

// =============================================================================
// Error Testing Utilities
// =============================================================================

/** Expect a function to throw a specific error type */
export function expectErrorType<T extends Error>(
	fn: () => void | Promise<void>,
	errorType: new (...args: any[]) => T,
): T {
	try {
		const result = fn();
		if (result instanceof Promise) {
			throw new Error("Use expectAsyncErrorType for async functions");
		}
		throw new Error("Expected function to throw");
	} catch (error) {
		expect(error).toBeInstanceOf(errorType);
		return error as T;
	}
}

/** Expect an async function to throw a specific error type */
export async function expectAsyncErrorType<T extends Error>(
	fn: () => Promise<void>,
	errorType: new (...args: any[]) => T,
): Promise<T> {
	try {
		await fn();
		throw new Error("Expected function to throw");
	} catch (error) {
		expect(error).toBeInstanceOf(errorType);
		return error as T;
	}
}

// =============================================================================
// Mock Data
// =============================================================================

/** Test image data (1x1 red PNG) */
export const TEST_IMAGE_PNG = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
	0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
	0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
	0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0x0f, 0x00, 0x00, 0x01, 0x00, 0x01, 0x5c,
	0x72, 0xa8, 0x66, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
	0x60, 0x82,
]);

/** Test SVG content */
export const TEST_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="25" fill="blue"/>
</svg>`;

/** Simple WOFF2 font header (minimal test data) */
export const TEST_FONT_WOFF2 = new Uint8Array([
	0x77,
	0x4f,
	0x46,
	0x32, // WOFF2 signature
	0x00,
	0x01,
	0x00,
	0x00, // Version and flags
	0x00,
	0x00,
	0x01,
	0x00, // Length (256 bytes)
	// ... rest would be actual font data
]);

// =============================================================================
// Test Case Definitions
// =============================================================================

/** Test case definition that matches Rust test structure */
export interface TestCase {
	name: string;
	files: Record<string, string | Uint8Array>;
	expectedSvg: string;
	shouldFail?: boolean;
	skipReason?: string;
}

/** Define standard test cases based on Rust examples */
export const TEST_CASES: TestCase[] = [
	{
		name: "empty",
		files: { "collagen.json": "{}" },
		expectedSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
	},
	{
		name: "basic-smiley",
		files: {
			"collagen.json": JSON.stringify({
				attrs: { viewBox: "0 0 100 100" },
				children: [
					{
						tag: "circle",
						attrs: {
							cx: "50%",
							cy: "50%",
							r: "40%",
							fill: "#ff0",
							stroke: "#000",
							"stroke-width": 3,
						},
					},
					{
						tag: "circle",
						attrs: {
							cx: 35,
							cy: 40,
							r: 5,
							fill: "#fff",
							stroke: "#000",
							"stroke-width": 1,
						},
					},
					{
						tag: "circle",
						attrs: {
							cx: 65,
							cy: 40,
							r: 5,
							fill: "#fff",
							stroke: "#000",
							"stroke-width": 1,
						},
					},
					{
						tag: "line",
						attrs: {
							x1: 25,
							y1: 60,
							x2: 75,
							y2: 60,
							stroke: "#f21",
							"stroke-width": 3,
						},
					},
				],
			}),
		},
		expectedSvg:
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50%" cy="50%" r="40%" fill="#ff0" stroke="#000" stroke-width="3"/><circle cx="35" cy="40" r="5" fill="#fff" stroke="#000" stroke-width="1"/><circle cx="65" cy="40" r="5" fill="#fff" stroke="#000" stroke-width="1"/><line x1="25" y1="60" x2="75" y2="60" stroke="#f21" stroke-width="3"/></svg>',
	},
];

// =============================================================================
// Test Execution Helper
// =============================================================================

/** Execute a test case against the TypeScript implementation */
export async function executeTestCase(
	testCase: TestCase,
	generateSvg: (fs: InMemoryFileSystem) => Promise<string>,
): Promise<void> {
	if (testCase.skipReason) {
		console.log(`Skipping test ${testCase.name}: ${testCase.skipReason}`);
		return;
	}

	const fs = await createTestFileSystem(testCase.files);

	if (testCase.shouldFail) {
		await expect(generateSvg(fs)).rejects.toThrow();
	} else {
		const actualSvg = await generateSvg(fs);
		expectSvgEqual(actualSvg, testCase.expectedSvg);
	}
}
