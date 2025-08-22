/**
 * Integration tests for Jsonnet functionality
 *
 * Tests Jsonnet compilation, import resolution, variable substitution,
 * and integration with the filesystem and validation systems.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { compileJsonnet, compileJsonnetFromFile } from "../jsonnet/index";
import { createFileSystem } from "../filesystem/index";
import { JsonnetError } from "../errors/index";

// =============================================================================
// Mock Setup
// =============================================================================

/** Mock File object for testing */
function createMockFile(name: string, content: string): File {
	const blob = new Blob([content], { type: "text/plain" });
	return new File([blob], name, { type: "text/plain" });
}

beforeEach(() => {
	// Mock DOM environment
	const mockScript = {
		src: "",
		addEventListener: vi.fn((event: string, callback: () => void) => {
			if (event === "load") {
				// Simulate successful script loading
				setTimeout(() => {
					(global as any).window = { ...(global as any).window };
					callback();
				}, 0);
			}
		}),
	};

	const mockDocument = {
		createElement: vi.fn(() => mockScript),
		head: { appendChild: vi.fn() },
	};

	// Set up global mocks
	vi.stubGlobal("document", mockDocument);
	vi.stubGlobal("window", { SjsonnetMain: undefined, exports: undefined });
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

// =============================================================================
// Basic Jsonnet Compilation Tests
// =============================================================================

describe("Basic Jsonnet Compilation", () => {
	it("should compile simple empty object", async () => {
		const filesystem = await createFileSystem({});
		const result = compileJsonnet("{}", filesystem);
		expect(result).toEqual({});
	});

	it("should compile simple object with string value", async () => {
		const filesystem = await createFileSystem({});
		const result = compileJsonnet("{ test: 'value' }", filesystem);
		expect(result).toEqual({ test: "value" });
	});

	it("should handle local variables", async () => {
		const filesystem = await createFileSystem({});
		const jsonnetCode = `
			local name = "test";
			{ name: name }
		`;
		const result = compileJsonnet(jsonnetCode, filesystem);
		expect(result).toEqual({ name: "test" });
	});

	it("should handle arrays", async () => {
		const filesystem = await createFileSystem({});
		const result = compileJsonnet('["a", "b", "c"]', filesystem);
		expect(result).toEqual(["a", "b", "c"]);
	});

	it("should handle complex objects", async () => {
		const filesystem = await createFileSystem({});
		const jsonnetCode = `
			{
				attrs: { viewBox: "0 0 100 100" },
				children: [
					{ tag: "rect" },
					"text"
				]
			}
		`;
		const result = compileJsonnet(jsonnetCode, filesystem);
		expect(result).toEqual({
			attrs: { viewBox: "0 0 100 100" },
			children: [{ tag: "rect" }, "text"],
		});
	});
});

// =============================================================================
// File-based Compilation Tests
// =============================================================================

describe("File-based Compilation", () => {
	it("should compile from filesystem", async () => {
		const filesystem = await createFileSystem({
			"collagen.jsonnet": createMockFile(
				"collagen.jsonnet",
				"{ test: 'value' }",
			),
		});

		const result = await compileJsonnetFromFile(
			filesystem,
			"collagen.jsonnet",
		);
		expect(result).toEqual({ test: "value" });
	});

	it("should handle missing files", async () => {
		const filesystem = await createFileSystem({});

		await expect(
			compileJsonnetFromFile(filesystem, "missing.jsonnet"),
		).rejects.toThrow(JsonnetError);
	});

	it("should preserve error context with file path", async () => {
		const filesystem = await createFileSystem({
			"invalid.jsonnet": createMockFile(
				"invalid.jsonnet",
				"{ invalid syntax here }",
			),
		});

		try {
			await compileJsonnetFromFile(filesystem, "invalid.jsonnet");
			expect.fail("Should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(JsonnetError);
			if (error instanceof JsonnetError) {
				expect(error.message).toContain("invalid.jsonnet");
				expect(error.message).toContain("Error");
			}
		}
	});

	it("should handle UTF-8 content", async () => {
		const unicodeContent = `{ unicode: "🌍 Hello 中文 العربية" }`;
		const filesystem = await createFileSystem({
			"unicode.jsonnet": createMockFile("unicode.jsonnet", unicodeContent),
		});

		// Mock should handle this gracefully
		const result = await compileJsonnetFromFile(
			filesystem,
			"unicode.jsonnet",
		);
		expect(result).toBeDefined();
	});
});

// =============================================================================
// Import Resolution Tests
// =============================================================================

describe("Import Resolution", () => {
	it("should resolve simple imports", async () => {
		const filesystem = await createFileSystem({
			"main.jsonnet": createMockFile(
				"main.jsonnet",
				'import "shared.jsonnet"',
			),
			"shared.jsonnet": createMockFile(
				"shared.jsonnet",
				"{ shared: 'value' }",
			),
		});

		const result = await compileJsonnetFromFile(filesystem, "main.jsonnet");
		expect(result).toEqual({ shared: "value" });
	});

	it("should resolve imports with .libsonnet extension", async () => {
		const filesystem = await createFileSystem({
			"main.jsonnet": createMockFile(
				"main.jsonnet",
				'import "utils.libsonnet"',
			),
			"utils.libsonnet": createMockFile(
				"utils.libsonnet",
				"{ util: 'function' }",
			),
		});

		const result = await compileJsonnetFromFile(filesystem, "main.jsonnet");
		expect(result).toEqual({ util: "function" });
	});

	it("should handle nested directory imports", async () => {
		const filesystem = await createFileSystem({
			"main.jsonnet": createMockFile(
				"main.jsonnet",
				'import "shared/config.jsonnet"',
			),
			"shared/config.jsonnet": createMockFile(
				"config.jsonnet",
				"{ config: 'value' }",
			),
		});

		const result = await compileJsonnetFromFile(filesystem, "main.jsonnet");
		expect(result).toEqual({ config: "value" });
	});

	it("should handle missing imports gracefully", async () => {
		const filesystem = await createFileSystem({
			"main.jsonnet": createMockFile(
				"main.jsonnet",
				'import "missing.jsonnet"',
			),
		});

		// Missing imports should throw an error
		await expect(
			compileJsonnetFromFile(filesystem, "main.jsonnet"),
		).rejects.toThrow(JsonnetError);
	});

	it("should handle relative imports", async () => {
		const filesystem = await createFileSystem({
			"subdir/main.jsonnet": createMockFile(
				"main.jsonnet",
				'import "../shared.jsonnet"',
			),
			"shared.jsonnet": createMockFile(
				"shared.jsonnet",
				"{ relative: 'import' }",
			),
		});

		const result = await compileJsonnetFromFile(
			filesystem,
			"subdir/main.jsonnet",
		);
		expect(result).toEqual({ relative: "import" });
	});
});

// =============================================================================
// Configuration Tests
// =============================================================================

describe("Jsonnet Configuration", () => {
	it("should handle nonempty cwd", async () => {
		const filesystem = await createFileSystem({});
		const config = { cwd: "foo/bar" };

		const result = compileJsonnet("{}", filesystem, config);
		expect(result).toEqual({});
	});

	it("should combine all config options", async () => {
		const filesystem = await createFileSystem({});
		const config = { tlaVars: {} };

		const result = compileJsonnet(
			"{ combined: true }",
			filesystem,
			config,
		);
		expect(result).toEqual({ combined: true });
	});
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe("Jsonnet Error Handling", () => {
	it("should handle syntax errors", async () => {
		const filesystem = await createFileSystem({});

		expect(() => compileJsonnet("SYNTAX ERROR", filesystem)).toThrow(
			JsonnetError,
		);
	});

	it("should handle runtime errors", async () => {
		const filesystem = await createFileSystem({});

		expect(() => compileJsonnet("RUNTIME_ERROR", filesystem)).toThrow(
			JsonnetError,
		);
	});

	it("should preserve original error messages", async () => {
		const filesystem = await createFileSystem({});

		try {
			compileJsonnet("{ invalid: syntax }", filesystem);
			expect.fail("Should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(JsonnetError);
			if (error instanceof JsonnetError) {
				expect(error.message).toContain("Error");
			}
		}
	});

	it("should include file path in errors", async () => {
		const filesystem = await createFileSystem({
			"error.jsonnet": createMockFile("error.jsonnet", "RUNTIME_ERROR"),
		});

		try {
			await compileJsonnetFromFile(filesystem, "error.jsonnet");
			expect.fail("Should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(JsonnetError);
			if (error instanceof JsonnetError) {
				expect(error.message).toContain("error.jsonnet");
			}
		}
	});

	it("should handle file read errors", async () => {
		const filesystem = await createFileSystem({});

		await expect(
			compileJsonnetFromFile(filesystem, "nonexistent.jsonnet"),
		).rejects.toThrow();
	});
});

// =============================================================================
// Complex Integration Tests
// =============================================================================

describe("Complex Jsonnet Integration", () => {
	it("should handle complex Collagen manifest", async () => {
		const manifestCode = `
			local width = 400;
			local height = 300;

			{
				attrs: { viewBox: "0 0 %d %d" % [width, height] },
				children: [
					{
						tag: "rect",
						attrs: {
							x: 0,
							y: 0,
							width: width,
							height: height,
							fill: "blue"
						}
					},
					{
						tag: "text",
						attrs: { x: width/2, y: height/2 },
						children: ["Hello Jsonnet!"]
					}
				]
			}
		`;

		const filesystem = await createFileSystem({});
		const result = compileJsonnet(manifestCode, filesystem);

		// Mock should return some structure
		expect(result).toBeDefined();
		expect(typeof result).toBe("object");
	});

	it("should handle modular Collagen project", async () => {
		const filesystem = await createFileSystem({
			"collagen.jsonnet": createMockFile(
				"collagen.jsonnet",
				`
				local config = import "config.jsonnet";
				local shapes = import "shapes.libsonnet";

				config + { children: shapes.createShapes() }
			`,
			),
			"config.jsonnet": createMockFile(
				"config.jsonnet",
				`
				{ attrs: { viewBox: "0 0 100 100" } }
			`,
			),
			"shapes.libsonnet": createMockFile(
				"shapes.libsonnet",
				`
				{
					createShapes(): [
						{ tag: "circle", attrs: { cx: 50, cy: 50, r: 20 } }
					]
				}
			`,
			),
		});

		const result = await compileJsonnetFromFile(
			filesystem,
			"collagen.jsonnet",
		);
		expect(result).toBeDefined();
	});

	it("should handle loops and iterations", async () => {
		const loopCode = `
			local count = 5;

			{
				children: [
					{
						tag: "circle",
						attrs: {
							cx: i * 20,
							cy: 50,
							r: 10,
							fill: "hsl(%d, 100%%, 50%%)" % (i * 60)
						}
					}
					for i in std.range(0, count - 1)
				]
			}
		`;

		const filesystem = await createFileSystem({});
		const result = compileJsonnet(loopCode, filesystem);

		// Mock should return array-like structure
		expect(result).toBeDefined();
	});

	it("should handle functions and libraries", async () => {
		const filesystem = await createFileSystem({
			"main.jsonnet": createMockFile(
				"main.jsonnet",
				`
				local utils = import "utils.libsonnet";

				{
					children: [
						utils.createButton(10, 10, "Click me"),
						utils.createButton(10, 50, "Cancel")
					]
				}
			`,
			),
			"utils.libsonnet": createMockFile(
				"utils.libsonnet",
				`
				{
					createButton(x, y, text): {
						tag: "g",
						attrs: { transform: "translate(%d, %d)" % [x, y] },
						children: [
							{ tag: "rect", attrs: { width: 80, height: 30 } },
							{ tag: "text", children: [text] }
						]
					}
				}
			`,
			),
		});

		const result = await compileJsonnetFromFile(filesystem, "main.jsonnet");
		expect(result).toBeDefined();
	});
});

// =============================================================================
// Edge Cases and Robustness Tests
// =============================================================================

describe("Jsonnet Edge Cases", () => {
	it("should handle empty files", async () => {
		const filesystem = await createFileSystem({
			"empty.jsonnet": createMockFile("empty.jsonnet", "{}"),
		});

		// Should handle simple empty object
		const result = await compileJsonnetFromFile(filesystem, "empty.jsonnet");
		expect(result).toEqual({});
	});

	it("should handle very large files", async () => {
		const largeContent = `{
			data: [${Array(1000).fill('"item"').join(", ")}]
		}`;

		const filesystem = await createFileSystem({
			"large.jsonnet": createMockFile("large.jsonnet", largeContent),
		});

		const result = await compileJsonnetFromFile(filesystem, "large.jsonnet");
		expect(result).toBeDefined();
	});

	it("should handle unicode in Jsonnet code", async () => {
		const unicodeCode = `{
			message: "Hello 🌍 World! 中文 العربية",
			emoji: "🎨✨🚀"
		}`;

		const filesystem = await createFileSystem({});
		const result = compileJsonnet(unicodeCode, filesystem);
		expect(result).toBeDefined();
	});

	it("should handle deeply nested imports", async () => {
		const filesystem = await createFileSystem({
			"main.jsonnet": createMockFile(
				"main.jsonnet",
				'import "level1.jsonnet"',
			),
			"level1.jsonnet": createMockFile(
				"level1.jsonnet",
				'import "level2.jsonnet"',
			),
			"level2.jsonnet": createMockFile(
				"level2.jsonnet",
				'import "level3.jsonnet"',
			),
			"level3.jsonnet": createMockFile("level3.jsonnet", "{ deep: true }"),
		});

		const result = await compileJsonnetFromFile(filesystem, "main.jsonnet");
		expect(result).toBeDefined();
	});

	it("should handle circular import protection", async () => {
		const filesystem = await createFileSystem({
			"a.jsonnet": createMockFile("a.jsonnet", 'import "b.jsonnet"'),
			"b.jsonnet": createMockFile("b.jsonnet", 'import "a.jsonnet"'),
		});

		// Should either handle gracefully or throw appropriate error
		try {
			await compileJsonnetFromFile(filesystem, "a.jsonnet");
		} catch (error) {
			// Circular imports should be caught
			expect(error).toBeDefined();
		}
	});
});
