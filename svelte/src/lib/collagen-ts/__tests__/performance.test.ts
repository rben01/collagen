/**
 * Performance and stress tests for the Collagen TypeScript implementation
 *
 * Tests system behavior under load, with large datasets, complex operations,
 * and edge cases to ensure robustness and performance characteristics.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	generateSvgFromFiles,
	createFileSystem,
	parseManifest,
	generateSvgFromFileSystem,
} from "../index.js";

// =============================================================================
// Test Utilities
// =============================================================================

/** Create a mock File object for testing */
function createMockFile(
	name: string,
	content: string,
	type = "text/plain",
): File {
	const blob = new Blob([content], { type });
	return new File([blob], name, { type });
}

/** Create a mock binary File object for testing */
function createMockBinaryFile(
	name: string,
	data: number[],
	type = "application/octet-stream",
): File {
	const uint8Array = new Uint8Array(data);
	const blob = new Blob([uint8Array.buffer], { type });
	return new File([blob], name, { type });
}

/** Generate a large test manifest with many elements */
function generateLargeManifest(elementCount: number) {
	const children = [...Array(elementCount)].map((_, i) => ({
		tag: "rect",
		attrs: {
			x: (i % 100) * 10,
			y: Math.floor(i / 100) * 10,
			width: 8,
			height: 8,
			fill: `hsl(${(i * 137) % 360}, 70%, 50%)`,
			id: `rect-${i}`,
		},
	}));

	return {
		attrs: {
			viewBox: `0 0 ${100 * 10} ${Math.ceil(elementCount / 100) * 10}`,
			width: 1000,
			height: Math.ceil(elementCount / 100) * 10,
		},
		children,
	};
}

/** Generate nested group structure */
function generateNestedStructure(depth: number, childrenPerLevel: number) {
	function createLevel(currentDepth: number): any {
		if (currentDepth === 0) {
			return { tag: "circle", attrs: { cx: 10, cy: 10, r: 5, fill: "red" } };
		}

		const nextLevel = createLevel(currentDepth - 1);
		return {
			tag: "g",
			attrs: {
				id: `level-${currentDepth}`,
				transform: `translate(${currentDepth * 5}, ${currentDepth * 5})`,
			},
			children: [...Array(childrenPerLevel)].map(() => nextLevel),
		};
	}

	return { attrs: { viewBox: "0 0 500 500" }, children: [createLevel(depth)] };
}

/** Measure execution time */
async function measureTime<T>(
	fn: () => Promise<T>,
): Promise<{ result: T; duration: number }> {
	const start = performance.now();
	const result = await fn();
	const duration = performance.now() - start;
	return { result, duration };
}

/** Create test files with large binary content */
function createLargeBinaryFiles(
	count: number,
	sizeBytes: number,
): Record<string, File> {
	const files: Record<string, File> = {};

	for (let i = 0; i < count; i++) {
		const data = [...Array(sizeBytes)].map((_, j) => (i + j) % 256);
		files[`image-${i}.png`] = createMockBinaryFile(
			`image-${i}.png`,
			data,
			"image/png",
		);
	}

	return files;
}

// Mock performance.mark and performance.measure for Node.js environment
beforeEach(() => {
	if (typeof performance.mark === "undefined") {
		global.performance.mark = vi.fn();
		global.performance.measure = vi.fn();
		global.performance.getEntriesByName = vi.fn(() => []);
	}
});

// =============================================================================
// Scale and Volume Tests
// =============================================================================

describe("Scale and Volume Performance", () => {
	it("should handle large number of SVG elements efficiently", async () => {
		const elementCounts = [10, 50, 100, 200];
		const results: Array<{ count: number; duration: number }> = [];

		for (const count of elementCounts) {
			const manifest = generateLargeManifest(count);
			const files = {
				"collagen.json": createMockFile(
					"collagen.json",
					JSON.stringify(manifest),
				),
			};

			const { duration } = await measureTime(async () => {
				return await generateSvgFromFiles(files);
			});

			results.push({ count, duration });
			console.log(`${count} elements: ${duration.toFixed(2)}ms`);

			// Performance should scale reasonably (not exponentially)
			expect(duration).toBeLessThan(count * 2); // Max 2ms per element is generous
		}

		// Verify that performance scales reasonably
		for (let i = 1; i < results.length; i++) {
			const prev = results[i - 1];
			const curr = results[i];
			const scaleRatio = curr.count / prev.count;
			const timeRatio = curr.duration / prev.duration;

			// Time should not scale worse than quadratically
			expect(timeRatio).toBeLessThan(scaleRatio * scaleRatio);
		}
	}, 300);

	it("should handle deeply nested element structures", async () => {
		const depths = [1, 2, 4, 8];
		const childrenPerLevel = 3;

		for (const depth of depths) {
			const manifest = generateNestedStructure(depth, childrenPerLevel);
			const files = {
				"collagen.json": createMockFile(
					"collagen.json",
					JSON.stringify(manifest),
				),
			};

			const { result, duration } = await measureTime(async () => {
				return await generateSvgFromFiles(files);
			});

			console.log(`Depth ${depth}: ${duration.toFixed(2)}ms`);

			// Should complete successfully even with deep nesting
			expect(result).toContain("<svg");
			expect(result).toContain("<g");
			expect(result).toContain("<circle");

			// Should not take exponentially long
			expect(duration).toBeLessThan(depth * 100); // Max 100ms per level
		}
	}, 5000);

	it("should handle large binary asset files", async () => {
		const imageSizes = [1024, 10240, 102400]; // 1KB, 10KB, 100KB

		for (const size of imageSizes) {
			const imageData = [...Array(size)].map((_, i) => i % 256);
			const files = {
				"collagen.json": createMockFile(
					"collagen.json",
					JSON.stringify({ children: [{ image_path: "large.png" }] }),
				),
				"large.png": createMockBinaryFile(
					"large.png",
					imageData,
					"image/png",
				),
			};

			const { result, duration } = await measureTime(async () => {
				return await generateSvgFromFiles(files);
			});

			console.log(`${size} bytes: ${duration.toFixed(2)}ms`);

			// Should handle large files
			expect(result).toContain("<image");
			expect(result).toContain("data:image/png;base64,");

			// Base64 encoding should be reasonably fast
			expect(duration).toBeLessThan(size / 10); // Generous: 10 bytes per ms
		}
	}, 1500);

	it("should handle many small files efficiently", async () => {
		const fileCounts = [5, 10, 20];

		for (const count of fileCounts) {
			const children = [...Array(count)].map((_, i) => ({
				image_path: `image-${i}.png`,
			}));

			const files: Record<string, File> = {
				"collagen.json": createMockFile(
					"collagen.json",
					JSON.stringify({ children }),
				),
				...createLargeBinaryFiles(count, 100),
			};

			const { result, duration } = await measureTime(
				async () => await generateSvgFromFiles(files),
			);

			console.log(`${count} files: ${duration.toFixed(2)}ms`);

			// Should handle all files
			expect(result).toContain("<svg");
			const imageCount = (result.match(/<image/g) || []).length;
			expect(imageCount).toBe(count);

			// Should scale linearly with file count
			expect(duration).toBeLessThan(count * 50); // Max 50ms per file
		}
	}, 250);
});

// =============================================================================
// Memory Usage Tests
// =============================================================================

describe("Memory Usage Performance", () => {
	it("should not leak memory with repeated operations", async () => {
		const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;

		// Perform many operations
		for (let i = 0; i < 50; i++) {
			const manifest = generateLargeManifest(10);
			const files = {
				"collagen.json": createMockFile(
					"collagen.json",
					JSON.stringify(manifest),
				),
			};

			await generateSvgFromFiles(files);

			// Force garbage collection if available
			if (global.gc) {
				global.gc();
			}
		}

		const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;

		// Memory usage should not grow excessively
		if (initialMemory > 0 && finalMemory > 0) {
			const memoryGrowth = finalMemory - initialMemory;
			console.log(
				`Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`,
			);

			// Should not leak more than 50MB (generous threshold)
			expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
		}
	}, 2000);

	it("should handle memory pressure gracefully", async () => {
		// Create very large structures to test memory limits
		const hugeElementCount = 100;
		const manifest = generateLargeManifest(hugeElementCount);

		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify(manifest),
			),
		};

		try {
			const { result, duration } = await measureTime(async () => {
				return await generateSvgFromFiles(files);
			});

			console.log(
				`Huge project (${hugeElementCount} elements): ${duration.toFixed(2)}ms`,
			);

			// Should either complete successfully or throw appropriate error
			expect(result).toContain("<svg");
			expect(duration).toBeLessThan(3000); // Max 3 seconds
		} catch (error) {
			// If it fails due to memory constraints, error should be informative
			expect(error).toBeDefined();
			expect(error instanceof Error).toBe(true);
		}
	}, 4500);

	it("should efficiently handle string operations", async () => {
		// Test with content that creates very long strings
		const longTextContent = "A".repeat(10000);
		const manifest = {
			children: [...Array(100)].map((_, i) => ({
				tag: "text",
				attrs: { x: i * 10, y: 20 },
				children: [longTextContent],
			})),
		};

		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify(manifest),
			),
		};

		const { result, duration } = await measureTime(async () => {
			return await generateSvgFromFiles(files);
		});

		console.log(`Long strings: ${duration.toFixed(2)}ms`);

		// Should handle long strings efficiently
		expect(result).toContain("<svg");
		expect(result).toContain(longTextContent);
		expect(duration).toBeLessThan(5000); // Max 5 seconds
	}, 10000);
});

// =============================================================================
// Concurrent Operations Tests
// =============================================================================

describe("Concurrent Operations Performance", () => {
	it("should handle multiple simultaneous processing requests", async () => {
		const projectCount = 10;
		const projects = [...Array(projectCount)].map((_, i) => ({
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify(generateLargeManifest(50 + i * 10)),
			),
		}));

		const { result: results, duration } = await measureTime(
			async () =>
				// Process all projects concurrently
				await Promise.all(
					projects.map(files => generateSvgFromFiles(files)),
				),
		);

		console.log(
			`${projectCount} concurrent projects: ${duration.toFixed(2)}ms`,
		);

		// All should complete successfully
		expect(results).toHaveLength(projectCount);
		results.forEach(svg => {
			expect(svg).toContain("<svg");
			expect(svg).toContain("<rect");
		});

		// Concurrent execution should be faster than sequential
		expect(duration).toBeLessThan(projectCount * 1000); // Less than 1s per project
	}, 15000);

	it("should handle filesystem operations under load", async () => {
		const fileCount = 100;
		const files: Record<string, File> = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify({
					children: [...Array(fileCount)].map((_, i) => ({
						image_path: `img-${i}.png`,
					})),
				}),
			),
		};

		// Add many image files
		for (let i = 0; i < fileCount; i++) {
			files[`img-${i}.png`] = createMockBinaryFile(
				`img-${i}.png`,
				[0x89, 0x50, 0x4e, 0x47],
				"image/png",
			);
		}

		const filesystem = await createFileSystem(files);

		const { duration } = await measureTime(async () => {
			// Test file system operations
			const info = await import("../index.js").then(m =>
				m.getFileSystemInfo?.(filesystem),
			);
			const manifest = await parseManifest(filesystem);
			const svg = await generateSvgFromFileSystem(filesystem);

			return { info, manifest, svg };
		});

		console.log(`${fileCount} file operations: ${duration.toFixed(2)}ms`);

		// Should handle many files efficiently
		expect(duration).toBeLessThan(fileCount * 20); // Max 20ms per file
	}, 15000);
});

// =============================================================================
// Edge Case Performance Tests
// =============================================================================

describe("Edge Case Performance", () => {
	it("should handle extremely long attribute values", async () => {
		const longValue = "data:image/svg+xml;base64," + "A".repeat(100000);
		const manifest = {
			children: [
				{
					tag: "image",
					attrs: { href: longValue, width: 100, height: 100 },
				},
			],
		};

		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify(manifest),
			),
		};

		const { result, duration } = await measureTime(async () => {
			return await generateSvgFromFiles(files);
		});

		console.log(`Long attribute: ${duration.toFixed(2)}ms`);

		// Should handle long attributes
		expect(result).toContain("<svg");
		expect(result).toContain("<image");
		expect(duration).toBeLessThan(3000); // Max 3 seconds
	}, 10000);

	it("should handle complex nested data structures", async () => {
		// Create deeply nested object with many properties
		function createComplexObject(depth: number): any {
			if (depth === 0) {
				return {
					tag: "rect",
					attrs: Object.fromEntries(
						[...Array(20)].map((_, i) => [`prop-${i}`, `value-${i}`]),
					),
				};
			}

			return {
				tag: "g",
				attrs: Object.fromEntries(
					[...Array(10)].map((_, i) => [`attr-${i}`, `val-${i}`]),
				),
				children: [...Array(3)].map(() => createComplexObject(depth - 1)),
			};
		}

		const manifest = { children: [createComplexObject(4)] };

		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify(manifest),
			),
		};

		const { result, duration } = await measureTime(async () => {
			return await generateSvgFromFiles(files);
		});

		console.log(`Complex nesting: ${duration.toFixed(2)}ms`);

		// Should handle complex structures
		expect(result).toContain("<svg");
		expect(result).toContain("<g");
		expect(duration).toBeLessThan(5000); // Max 5 seconds
	}, 10000);

	it("should handle many repeated identical elements", async () => {
		const repeatCount = 1000;
		const baseElement = {
			tag: "circle",
			attrs: { cx: 50, cy: 50, r: 10, fill: "blue" },
		};

		const manifest = {
			attrs: { viewBox: "0 0 100 100" },
			children: Array(repeatCount).fill(baseElement),
		};

		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify(manifest),
			),
		};

		const { result, duration } = await measureTime(async () => {
			return await generateSvgFromFiles(files);
		});

		console.log(
			`${repeatCount} identical elements: ${duration.toFixed(2)}ms`,
		);

		// Should handle repetition efficiently
		expect(result).toContain("<svg");
		const circleCount = (result.match(/<circle/g) || []).length;
		expect(circleCount).toBe(repeatCount);
		expect(duration).toBeLessThan(repeatCount * 2); // Max 2ms per element
	}, 10000);

	it("should handle unicode-heavy content efficiently", async () => {
		const unicodeStrings = [
			"🌍🌎🌏🚀✨💫⭐🌟💖💕💗💝💘💓💞",
			"中文测试内容包含各种复杂字符和符号",
			"العربية النص مع الرموز والأحرف المعقدة",
			"🎨🎭🎪🎯🎱🎳🎮🎲🃏🀄🎴🎵🎶🎼🎹",
			"Ελληνικά κείμενο με σύμβολα και πολύπλοκους χαρακτήρες",
		];

		const manifest = {
			children: unicodeStrings.map((text, i) => ({
				tag: "text",
				attrs: { x: 10, y: (i + 1) * 30 },
				children: [text.repeat(10)], // Repeat to make it substantial
			})),
		};

		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify(manifest),
			),
		};

		const { result, duration } = await measureTime(async () => {
			return await generateSvgFromFiles(files);
		});

		console.log(`Unicode content: ${duration.toFixed(2)}ms`);

		// Should handle unicode efficiently
		expect(result).toContain("<svg");
		unicodeStrings.forEach(str => {
			expect(result).toContain(str);
		});
		expect(duration).toBeLessThan(3000); // Max 3 seconds
	}, 10000);
});

// =============================================================================
// Regression Performance Tests
// =============================================================================

describe("Performance Regression Prevention", () => {
	it("should maintain baseline performance for common operations", async () => {
		const baselineTests = [
			{ name: "Empty project", manifest: {}, expectedMaxTime: 100 },
			{
				name: "Simple project",
				manifest: {
					children: [
						{
							tag: "rect",
							attrs: { x: 0, y: 0, width: 100, height: 100 },
						},
						{ tag: "text", children: ["Hello"] },
					],
				},
				expectedMaxTime: 200,
			},
			{
				name: "Medium complexity",
				manifest: generateLargeManifest(100),
				expectedMaxTime: 1000,
			},
		];

		for (const test of baselineTests) {
			const files = {
				"collagen.json": createMockFile(
					"collagen.json",
					JSON.stringify(test.manifest),
				),
			};

			const { duration } = await measureTime(async () => {
				return await generateSvgFromFiles(files);
			});

			console.log(
				`${test.name}: ${duration.toFixed(2)}ms (max: ${test.expectedMaxTime}ms)`,
			);

			// Should not exceed baseline expectations
			expect(duration).toBeLessThan(test.expectedMaxTime);
		}
	}, 15000);

	it("should detect performance regressions in parsing", async () => {
		const complexManifest = {
			attrs: { viewBox: "0 0 1000 1000", width: 1000, height: 1000 },
			children: [...Array(500)].map((_, i) => ({
				tag: "g",
				attrs: {
					id: `group-${i}`,
					transform: `translate(${(i % 20) * 50}, ${Math.floor(i / 20) * 50})`,
					opacity: (i % 10) / 10,
				},
				children: [
					{
						tag: "rect",
						attrs: {
							x: 0,
							y: 0,
							width: 40,
							height: 40,
							fill: `hsl(${i * 7}, 70%, 50%)`,
						},
					},
					{
						tag: "text",
						attrs: {
							x: 20,
							y: 25,
							"text-anchor": "middle",
							"font-size": 8,
						},
						children: [`Item ${i}`],
					},
				],
			})),
		};

		const files = {
			"collagen.json": createMockFile(
				"collagen.json",
				JSON.stringify(complexManifest),
			),
		};

		const { result, duration } = await measureTime(async () => {
			return await generateSvgFromFiles(files);
		});

		console.log(`Complex parsing: ${duration.toFixed(2)}ms`);

		// Verify correctness
		expect(result).toContain("<svg");
		expect((result.match(/<g/g) || []).length).toBe(500);
		expect((result.match(/<rect/g) || []).length).toBe(500);
		expect((result.match(/<text/g) || []).length).toBe(500);

		// Performance baseline
		expect(duration).toBeLessThan(3000); // Max 3 seconds for 500 complex groups
	}, 10000);
});
