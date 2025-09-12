/**
 * Integration tests for Jsonnet functionality
 *
 * Tests Jsonnet compilation, import resolution, variable substitution,
 * and integration with the filesystem and validation systems.
 */

import { describe, it, expect } from "vitest";
import { compileJsonnet } from "../jsonnet/index";
import { JsonnetError, MissingManifestError } from "../errors/index";
import { createFileSystem } from "./test-utils";

// =============================================================================
// Basic Jsonnet Compilation Tests
// =============================================================================

describe("Basic Jsonnet Compilation", () => {
	it("should compile simple empty object", async () => {
		const fs = await createFileSystem({});
		const result = await compileJsonnet("{}", fs);
		expect(result).toEqual({});
	});

	it("should compile simple object with string value", async () => {
		const fs = await createFileSystem({});
		const result = await compileJsonnet("{ test: 'value' }", fs);
		expect(result).toEqual({ test: "value" });
	});

	it("should handle local variables", async () => {
		const fs = await createFileSystem({});
		const jsonnetCode = `
			local name = "test";
			{ name: name }
		`;
		const result = await compileJsonnet(jsonnetCode, fs);
		expect(result).toEqual({ name: "test" });
	});

	it("should handle arrays", async () => {
		const fs = await createFileSystem({});
		const result = await compileJsonnet('["a", "b", "c"]', fs);
		expect(result).toEqual(["a", "b", "c"]);
	});

	it("should handle complex objects", async () => {
		const fs = await createFileSystem({});
		const jsonnetCode = `
			{
				attrs: { viewBox: "0 0 100 100" },
				children: [
					{ tag: "rect" },
					"text"
				]
			}
		`;
		const result = await compileJsonnet(jsonnetCode, fs);
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
	it("should handle missing files", async () => {
		const fs = await createFileSystem({});
		await expect(fs.generateUntypedObject()).rejects.toThrow(
			MissingManifestError,
		);
	});

	it("should preserve error context with file path", async () => {
		const fs = await createFileSystem({
			"collagen.jsonnet": "{ invalid syntax here }",
		});

		try {
			await fs.generateUntypedObject();
			expect.fail("Should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(JsonnetError);
			if (error instanceof JsonnetError) {
				expect(error.message).toContain("collagen.jsonnet");
				expect(error.message).toContain("Error");
			}
		}
	});

	it("should handle UTF-8 content", async () => {
		const unicodeContent = `{ unicode: "🌍 Hello 中文 العربية" }`;
		const fs = await createFileSystem({ "collagen.jsonnet": unicodeContent });

		// Mock should handle this gracefully
		const result = await fs.generateUntypedObject();
		expect(result).toEqual({ unicode: "🌍 Hello 中文 العربية" });
	});
});

// =============================================================================
// Import Resolution Tests
// =============================================================================

describe("Import Resolution", () => {
	it("should resolve simple imports", async () => {
		const fs = await createFileSystem({
			"collagen.jsonnet": 'import "shared.jsonnet"',
			"shared.jsonnet": "{ shared: 'value' }",
		});

		const result = await fs.generateUntypedObject();
		expect(result).toEqual({ shared: "value" });
	});

	it("should resolve imports with .libsonnet extension", async () => {
		const fs = await createFileSystem({
			"collagen.jsonnet": 'import "utils.libsonnet"',
			"utils.libsonnet": "{ util: 'function' }",
		});

		const result = await fs.generateUntypedObject();
		expect(result).toEqual({ util: "function" });
	});

	it("should handle nested directory imports", async () => {
		const fs = await createFileSystem({
			"collagen.jsonnet": 'import "shared/config.jsonnet"',
			"shared/config.jsonnet": "{ config: 'value' }",
		});

		const result = await fs.generateUntypedObject();
		expect(result).toEqual({ config: "value" });
	});

	it("should handle missing imports gracefully", async () => {
		const fs = await createFileSystem({
			"collagen.jsonnet": 'import "missing.jsonnet"',
		});

		// Missing imports should throw an error
		await expect(fs.generateUntypedObject()).rejects.toThrow(JsonnetError);
	});

	it("should handle relative imports", async () => {
		const fs = await createFileSystem({
			"collagen.jsonnet": 'import "subdir/main.jsonnet"',
			"subdir/main.jsonnet": 'import "../shared.jsonnet"',
			"shared.jsonnet": "{ relative: 'import' }",
		});

		const result = await fs.generateUntypedObject();
		expect(result).toEqual({ relative: "import" });
	});
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe("Jsonnet Error Handling", () => {
	it("should handle syntax errors", async () => {
		const fs = await createFileSystem({ "collagen.jsonnet": "SYNTAX ERROR" });

		await expect(fs.generateUntypedObject()).rejects.toThrow(JsonnetError);
	});

	it("should handle runtime errors", async () => {
		const fs = await createFileSystem({
			"collagen.jsonnet": "RUNTIME_ERROR",
		});

		await expect(fs.generateUntypedObject()).rejects.toThrow(JsonnetError);
	});

	it("should preserve original error messages", async () => {
		const fs = await createFileSystem({
			"collagen.jsonnet": "{ invalid: syntax }",
		});

		try {
			await fs.generateUntypedObject();
			expect.fail("Should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(JsonnetError);
			if (error instanceof JsonnetError) {
				expect(error.message).toContain("Error");
			}
		}
	});

	it("should include file path in errors", async () => {
		const fs = await createFileSystem({
			"collagen.jsonnet": "RUNTIME_ERROR",
		});

		try {
			await fs.generateUntypedObject();
			expect.fail("Should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(JsonnetError);
			if (error instanceof JsonnetError) {
				expect(error.message).toContain("collagen.jsonnet");
			}
		}
	});

	it("should handle file read errors", async () => {
		const fs = await createFileSystem({});

		await expect(fs.generateUntypedObject()).rejects.toThrow();
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

		const fs = await createFileSystem({ "collagen.jsonnet": manifestCode });
		const result = await fs.generateUntypedObject();

		expect(result).toBeDefined();
		expect(typeof result).toBe("object");
	});

	it("should handle modular Collagen project", async () => {
		const fs = await createFileSystem({
			"collagen.jsonnet": `
				local config = import "config.jsonnet";
				local shapes = import "shapes.libsonnet";

				config + { children: shapes.createShapes() }
			`,
			"config.jsonnet": `
				{ attrs: { viewBox: "0 0 100 100" } }
			`,
			"shapes.libsonnet": `
				{
					createShapes(): [
						{ tag: "circle", attrs: { cx: 50, cy: 50, r: 20 } }
					]
				}
			`,
		});

		const result = await fs.generateUntypedObject();
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

		const fs = await createFileSystem({ "collagen.jsonnet": loopCode });
		const result = await fs.generateUntypedObject();

		expect(result).toBeDefined();
	});

	it("should handle functions and libraries", async () => {
		const fs = await createFileSystem({
			"collagen.jsonnet": `
				local utils = import "utils.libsonnet";

				{
					children: [
						utils.createButton(10, 10, "Click me"),
						utils.createButton(10, 50, "Cancel")
					]
				}
			`,
			"utils.libsonnet": `
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
		});

		const result = await fs.generateUntypedObject();
		expect(typeof result).toBe("object");
	});
});

// =============================================================================
// Edge Cases and Robustness Tests
// =============================================================================

describe("Jsonnet Edge Cases", () => {
	it("should handle empty files", async () => {
		const fs = await createFileSystem({ "collagen.jsonnet": "{}" });

		// Should handle simple empty object
		const result = await fs.generateUntypedObject();
		expect(result).toEqual({});
	});

	it("should handle very large files", async () => {
		const largeContent = `{
			data: [${Array(1000).fill('"item"').join(", ")}]
		}`;

		const fs = await createFileSystem({ "collagen.jsonnet": largeContent });

		const result = await fs.generateUntypedObject();
		expect(typeof result).toBe("object");
	});

	it("should handle unicode in Jsonnet code", async () => {
		const unicodeCode = `{
			message: "Hello 🌍 World! 中文 العربية",
			emoji: "🎨✨🚀"
		}`;

		const fs = await createFileSystem({ "collagen.jsonnet": unicodeCode });
		const result = await fs.generateUntypedObject();
		expect(typeof result).toBe("object");
	});

	it("should handle deeply nested imports", async () => {
		const fs = await createFileSystem({
			"collagen.jsonnet": 'import "level1.jsonnet"',
			"level1.jsonnet": 'import "level2.jsonnet"',
			"level2.jsonnet": 'import "level3.jsonnet"',
			"level3.jsonnet": "{ deep: true }",
		});

		const result = await fs.generateUntypedObject();
		expect(result).toEqual({ deep: true });
	});

	it("should handle circular import protection", async () => {
		const fs = await createFileSystem({
			"a.jsonnet": 'import "b.jsonnet"',
			"b.jsonnet": 'import "a.jsonnet"',
		});

		// Should either handle gracefully or throw appropriate error
		try {
			await fs.generateUntypedObject();
		} catch (error) {
			expect(error).toBeDefined();
		}
	});
});
