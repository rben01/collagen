/**
 * Comprehensive tests for error handling and error types
 *
 * Tests all error classes, validation error lists, error formatting,
 * and error propagation through the system.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
	// Base classes
	CollagenError,
	// Validation errors
	InvalidTypeError,
	UnexpectedKeysError,
	UnrecognizedObjectError,
	MissingFieldError,
	InvalidFieldTypeError,
	// File system errors
	MissingManifestError,
	InvalidPathError,
	MissingFileError,
	FileReadError,
	// Processing errors
	ImageError,
	FontError,
	BundledFontNotFoundError,
	XmlError,
	JsonError,
	JsonnetError,
	// Validation error list
	ValidationErrorListImpl,
	InvalidSchemaError,
	createValidationErrorList,
	// Utilities
	isCollagenError,
	formatError,
} from "../errors/index.js";

// =============================================================================
// Base Error Tests
// =============================================================================

describe("Base Error Classes", () => {
	describe("CollagenError", () => {
		// Create a concrete implementation for testing
		class TestError extends CollagenError {
			readonly errorType = "Test";
		}

		it("should extend Error properly", () => {
			const error = new TestError("test message");
			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(CollagenError);
			expect(error.message).toBe("test message");
			expect(error.name).toBe("TestError");
			expect(error.errorType).toBe("Test");
		});

		it("should have proper stack trace", () => {
			const error = new TestError("test");
			expect(error.stack).toBeDefined();
			expect(error.stack).toContain("TestError");
		});
	});
});

// =============================================================================
// Validation Error Tests
// =============================================================================

describe("Validation Errors", () => {
	describe("InvalidTypeError", () => {
		it("should format message for various types", () => {
			expect(new InvalidTypeError("string").message).toContain('"string"');
			expect(new InvalidTypeError(123).message).toContain("123");
			expect(new InvalidTypeError(true).message).toContain("true");
			expect(new InvalidTypeError(null).message).toContain("null");
			expect(new InvalidTypeError(undefined).message).toContain(
				"Each tag must be an object",
			);
		});

		it("should handle complex objects", () => {
			const obj = { a: 1, b: [2, 3] };
			const error = new InvalidTypeError(obj);
			expect(error.message).toContain("Each tag must be an object");
			expect(error.errorType).toBe("InvalidType");
		});

		it("should handle circular references safely", () => {
			const obj: any = { a: 1 };
			obj.circular = obj;

			// Should not throw due to circular reference
			const error = new InvalidTypeError(obj);
			expect(error).toBeInstanceOf(InvalidTypeError);
		});
	});

	describe("UnexpectedKeysError", () => {
		it("should format single key", () => {
			const error = new UnexpectedKeysError("Generic", ["unexpected"]);
			expect(error.message).toBe(
				'Unexpected keys for tag "Generic": unexpected',
			);
			expect(error.errorType).toBe("UnexpectedKeys");
		});

		it("should format multiple keys", () => {
			const error = new UnexpectedKeysError("Image", [
				"key1",
				"key2",
				"key3",
			]);
			expect(error.message).toBe(
				'Unexpected keys for tag "Image": key1, key2, key3',
			);
		});

		it("should handle empty keys array", () => {
			const error = new UnexpectedKeysError("Text", []);
			expect(error.message).toBe('Unexpected keys for tag "Text": ');
		});
	});

	describe("UnrecognizedObjectError", () => {
		it("should provide helpful guidance for single primary key", () => {
			const obj = { tag: "rect", unexpected: "key" };
			const error = new UnrecognizedObjectError(obj);

			expect(error.message).toContain("tag");
			expect(error.message).toContain("Generic tag");
			expect(error.message).toContain("Check that all required fields");
			expect(error.errorType).toBe("UnrecognizedObject");
		});

		it("should handle multiple primary keys", () => {
			const obj = { tag: "rect", image_path: "test.jpg" };
			const error = new UnrecognizedObjectError(obj);

			expect(error.message).toContain("Multiple primary keys found");
			expect(error.message).toContain("tag, image_path");
		});

		it("should handle no primary keys", () => {
			const obj = { attrs: {}, children: [] };
			const error = new UnrecognizedObjectError(obj);

			expect(error.message).toContain("No recognized primary key found");
			expect(error.message).toContain("Tags must have one of:");
		});

		it("should provide documentation link", () => {
			const obj = { unknown: "field" };
			const error = new UnrecognizedObjectError(obj);

			expect(error.message).toContain("https://docs.rs/collagen");
		});

		it("should format object properly", () => {
			const obj = { complex: { nested: "value" }, array: [1, 2] };
			const error = new UnrecognizedObjectError(obj);

			expect(error.message).toContain(JSON.stringify(obj, null, 2));
		});

		it("should handle all known primary keys", () => {
			const testCases = [
				{ key: "tag", expectedType: "Generic" },
				{ key: "image_path", expectedType: "Image" },
				{ key: "text", expectedType: "Text" },
				{ key: "clgn_path", expectedType: "Container" },
				{ key: "fonts", expectedType: "Font" },
				{ key: "svg_path", expectedType: "NestedSvg" },
			];

			for (const { key, expectedType } of testCases) {
				const obj = { [key]: "value" };
				const error = new UnrecognizedObjectError(obj);
				expect(error.message).toContain(`${expectedType} tag`);
			}
		});
	});

	describe("MissingFieldError", () => {
		it("should format message correctly", () => {
			const error = new MissingFieldError("Image", "image_path");
			expect(error.message).toBe(
				'Missing required field "image_path" for Image tag',
			);
			expect(error.errorType).toBe("MissingField");
		});

		it("should handle different tag types", () => {
			const error = new MissingFieldError("Font", "fonts");
			expect(error.message).toContain("Font tag");
			expect(error.message).toContain("fonts");
		});
	});

	describe("InvalidFieldTypeError", () => {
		it("should format message with all details", () => {
			const error = new InvalidFieldTypeError(
				"Generic",
				"attrs",
				"object",
				"string",
			);
			expect(error.message).toBe(
				'Invalid type for field "attrs" in Generic tag: expected object, got string',
			);
			expect(error.errorType).toBe("InvalidFieldType");
		});

		it("should handle nested field names", () => {
			const error = new InvalidFieldTypeError(
				"Image",
				"attrs.x",
				"number",
				"string",
			);
			expect(error.message).toContain("attrs.x");
		});
	});
});

// =============================================================================
// File System Error Tests
// =============================================================================

describe("File System Errors", () => {
	describe("MissingManifestError", () => {
		it("should provide clear message", () => {
			const error = new MissingManifestError();
			expect(error.message).toContain("Missing manifest file");
			expect(error.message).toContain("collagen.jsonnet");
			expect(error.message).toContain("collagen.json");
			expect(error.errorType).toBe("MissingManifest");
		});
	});

	describe("InvalidPathError", () => {
		it("should include the invalid path", () => {
			const error = new InvalidPathError("/absolute/path");
			expect(error.message).toContain('"/absolute/path"');
			expect(error.message).toContain("may not begin with a '/'");
			expect(error.errorType).toBe("InvalidPath");
		});
	});

	describe("MissingFileError", () => {
		it("should include the missing path", () => {
			const error = new MissingFileError("path/to/missing.jpg");
			expect(error.message).toBe(
				"Missing file at path: path/to/missing.jpg",
			);
			expect(error.errorType).toBe("MissingFile");
		});
	});

	describe("FileReadError", () => {
		it("should work without cause", () => {
			const error = new FileReadError("test.txt");
			expect(error.message).toBe('Error reading file "test.txt"');
			expect(error.errorType).toBe("FileRead");
		});

		it("should include cause when provided", () => {
			const error = new FileReadError("test.txt", "Permission denied");
			expect(error.message).toBe(
				'Error reading file "test.txt": Permission denied',
			);
		});
	});
});

// =============================================================================
// Processing Error Tests
// =============================================================================

describe("Processing Errors", () => {
	describe("ImageError", () => {
		it("should prefix message appropriately", () => {
			const error = new ImageError("Invalid format");
			expect(error.message).toBe("Error processing image: Invalid format");
			expect(error.errorType).toBe("Image");
		});
	});

	describe("FontError", () => {
		it("should prefix message appropriately", () => {
			const error = new FontError("Font not found");
			expect(error.message).toBe("Error processing font: Font not found");
			expect(error.errorType).toBe("Font");
		});
	});

	describe("BundledFontNotFoundError", () => {
		it("should include font name", () => {
			const error = new BundledFontNotFoundError("Arial");
			expect(error.message).toBe('Could not find bundled font "Arial"');
			expect(error.errorType).toBe("BundledFontNotFound");
		});
	});

	describe("XmlError", () => {
		it("should prefix message appropriately", () => {
			const error = new XmlError("Invalid XML structure");
			expect(error.message).toBe("XML error: Invalid XML structure");
			expect(error.errorType).toBe("Xml");
		});
	});

	describe("JsonError", () => {
		it("should include path and cause", () => {
			const error = new JsonError("manifest.json", "Unexpected token");
			expect(error.message).toBe(
				'Failed to parse JSON at "manifest.json": Unexpected token',
			);
			expect(error.errorType).toBe("Json");
		});
	});

	describe("JsonnetError", () => {
		it("should include path and cause", () => {
			const error = new JsonnetError("manifest.jsonnet", "Syntax error");
			expect(error.message).toBe(
				'Error reading "manifest.jsonnet" as jsonnet: Syntax error',
			);
			expect(error.errorType).toBe("Jsonnet");
		});
	});
});

// =============================================================================
// Validation Error List Tests
// =============================================================================

describe("ValidationErrorList", () => {
	let errorList: ValidationErrorListImpl;

	beforeEach(() => {
		errorList = createValidationErrorList();
	});

	describe("Basic Operations", () => {
		it("should start empty", () => {
			expect(errorList.isEmpty()).toBe(true);
			expect(errorList.errors).toEqual([]);
		});

		it("should track errors when added", () => {
			const error = new MissingFieldError("Test", "field");
			errorList.push(error);

			expect(errorList.isEmpty()).toBe(false);
			expect(errorList.errors).toHaveLength(1);
			expect(errorList.errors[0]).toBe(error);
		});

		it("should accumulate multiple errors", () => {
			const error1 = new MissingFieldError("Test", "field1");
			const error2 = new InvalidFieldTypeError(
				"Test",
				"field2",
				"string",
				"number",
			);

			errorList.push(error1);
			errorList.push(error2);

			expect(errorList.errors).toHaveLength(2);
			expect(errorList.errors[0]).toBe(error1);
			expect(errorList.errors[1]).toBe(error2);
		});
	});

	describe("toString", () => {
		it("should format empty list", () => {
			expect(errorList.toString()).toBe("");
		});

		it("should format single error", () => {
			const error = new MissingFieldError("Test", "field");
			errorList.push(error);
			expect(errorList.toString()).toBe(error.message);
		});

		it("should format multiple errors with newlines", () => {
			const error1 = new MissingFieldError("Test", "field1");
			const error2 = new MissingFieldError("Test", "field2");

			errorList.push(error1);
			errorList.push(error2);

			const expected = `${error1.message}\n${error2.message}`;
			expect(errorList.toString()).toBe(expected);
		});
	});

	describe("throwIfErrors", () => {
		it("should not throw when empty", () => {
			expect(() => errorList.throwIfErrors()).not.toThrow();
		});

		it("should throw InvalidSchemaError when errors exist", () => {
			const error = new MissingFieldError("Test", "field");
			errorList.push(error);

			expect(() => errorList.throwIfErrors()).toThrow(InvalidSchemaError);
		});

		it("should include all errors in thrown exception", () => {
			const error1 = new MissingFieldError("Test", "field1");
			const error2 = new InvalidFieldTypeError(
				"Test",
				"field2",
				"string",
				"number",
			);

			errorList.push(error1);
			errorList.push(error2);

			try {
				errorList.throwIfErrors();
				expect.fail("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(InvalidSchemaError);
				const schemaError = e as InvalidSchemaError;
				expect(schemaError.validationErrors).toHaveLength(2);
				expect(schemaError.validationErrors[0]).toBe(error1);
				expect(schemaError.validationErrors[1]).toBe(error2);
			}
		});
	});
});

describe("InvalidSchemaError", () => {
	it("should format message with all errors", () => {
		const errorList = createValidationErrorList();
		errorList.push(new MissingFieldError("Test", "field1"));
		errorList.push(
			new InvalidFieldTypeError("Test", "field2", "string", "number"),
		);

		const schemaError = new InvalidSchemaError(errorList);

		expect(schemaError.message).toContain("Invalid schema:");
		expect(schemaError.message).toContain("field1");
		expect(schemaError.message).toContain("field2");
		expect(schemaError.errorType).toBe("InvalidSchema");
		expect(schemaError.validationErrors).toHaveLength(2);
	});

	it("should copy errors array to prevent modification", () => {
		const errorList = createValidationErrorList();
		const originalError = new MissingFieldError("Test", "field");
		errorList.push(originalError);

		const schemaError = new InvalidSchemaError(errorList);

		// Modify original list
		errorList.push(
			new InvalidFieldTypeError("Test", "field2", "string", "number"),
		);

		// Schema error should still have only the original error
		expect(schemaError.validationErrors).toHaveLength(1);
		expect(schemaError.validationErrors[0]).toBe(originalError);
	});
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe("Error Utilities", () => {
	describe("isCollagenError", () => {
		it("should detect Collagen errors", () => {
			expect(isCollagenError(new MissingFieldError("Test", "field"))).toBe(
				true,
			);
			expect(isCollagenError(new ImageError("test"))).toBe(true);
			expect(isCollagenError(new InvalidTypeError("test"))).toBe(true);
		});

		it("should reject non-Collagen errors", () => {
			expect(isCollagenError(new Error("standard error"))).toBe(false);
			expect(isCollagenError(new TypeError("type error"))).toBe(false);
			expect(isCollagenError("string")).toBe(false);
			expect(isCollagenError(null)).toBe(false);
			expect(isCollagenError(undefined)).toBe(false);
			expect(isCollagenError({})).toBe(false);
		});
	});

	describe("formatError", () => {
		it("should format Collagen errors", () => {
			const error = new MissingFieldError("Test", "field");
			expect(formatError(error)).toBe(error.message);
		});

		it("should format standard errors", () => {
			const error = new Error("standard error");
			expect(formatError(error)).toBe("standard error");
		});

		it("should format non-error values", () => {
			expect(formatError("string error")).toBe("string error");
			expect(formatError(123)).toBe("123");
			expect(formatError(null)).toBe("null");
			expect(formatError(undefined)).toBe("undefined");
		});

		it("should handle objects", () => {
			const obj = { error: "details" };
			expect(formatError(obj)).toBe("[object Object]");
		});
	});
});

// =============================================================================
// Error Propagation Tests
// =============================================================================

describe("Error Propagation", () => {
	it("should maintain error types through catch blocks", () => {
		try {
			throw new ImageError("test error");
		} catch (e) {
			expect(isCollagenError(e)).toBe(true);
			expect(e).toBeInstanceOf(ImageError);
			if (isCollagenError(e)) {
				expect(e.errorType).toBe("Image");
			}
		}
	});

	it("should preserve stack traces", () => {
		const error = new FontError("test");
		expect(error.stack).toBeDefined();
		expect(error.stack).toContain("FontError");
		expect(error.stack).toContain("test");
	});

	it("should work with async/await", async () => {
		async function throwError() {
			throw new XmlError("async error");
		}

		try {
			await throwError();
			expect.fail("Should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(XmlError);
			expect(isCollagenError(e)).toBe(true);
		}
	});

	it("should work with Promise.reject", async () => {
		const promise = Promise.reject(
			new JsonError("test.json", "syntax error"),
		);

		try {
			await promise;
			expect.fail("Should have rejected");
		} catch (e) {
			expect(e).toBeInstanceOf(JsonError);
			expect(isCollagenError(e)).toBe(true);
		}
	});
});

// =============================================================================
// Integration Tests
// =============================================================================

describe("Error Integration", () => {
	it("should handle complex validation scenario", () => {
		const errorList = createValidationErrorList();

		// Simulate multiple validation errors from different sources
		errorList.push(new InvalidTypeError(null));
		errorList.push(
			new UnexpectedKeysError("Generic", ["unexpected1", "unexpected2"]),
		);
		errorList.push(new MissingFieldError("Image", "image_path"));
		errorList.push(
			new InvalidFieldTypeError("Font", "fonts", "array", "string"),
		);

		expect(errorList.errors).toHaveLength(4);
		expect(errorList.isEmpty()).toBe(false);

		const errorString = errorList.toString();
		expect(errorString).toContain("Each tag must be an object");
		expect(errorString).toContain("Unexpected keys");
		expect(errorString).toContain("Missing required field");
		expect(errorString).toContain("Invalid type for field");

		expect(() => errorList.throwIfErrors()).toThrow(InvalidSchemaError);
	});

	it("should provide user-friendly error messages", () => {
		const errorList = createValidationErrorList();
		const complexObject = {
			tag: "rect",
			image_path: "conflict.jpg", // Conflicting primary keys
			unknown_field: "value",
		};

		errorList.push(new UnrecognizedObjectError(complexObject));

		const errorString = errorList.toString();
		expect(errorString).toContain("Multiple primary keys found");
		expect(errorString).toContain("tag, image_path");
		expect(errorString).toContain("exactly one primary key");
	});

	it("should handle deeply nested error contexts", () => {
		// Simulate errors from deeply nested processing
		const errors = [
			new FileReadError("deep/nested/path/image.jpg", "Permission denied"),
			new ImageError(
				"Failed to process image at deep/nested/path/image.jpg: Permission denied",
			),
			new XmlError(
				"Failed to process container at deep/nested: Failed to process image at deep/nested/path/image.jpg: Permission denied",
			),
		];

		// Each error should maintain its context
		expect(errors[0].message).toContain("deep/nested/path/image.jpg");
		expect(errors[1].message).toContain("deep/nested/path/image.jpg");
		expect(errors[2].message).toContain("deep/nested");
	});
});

// =============================================================================
// Edge Cases and Robustness Tests
// =============================================================================

describe("Error Edge Cases", () => {
	it("should handle extremely long messages", () => {
		const longMessage = "x".repeat(10000);
		const error = new ImageError(longMessage);
		expect(error.message).toContain(longMessage);
		expect(error.message.length).toBeGreaterThan(10000);
	});

	it("should handle unicode in error messages", () => {
		const unicodeMessage = "Error with 🌍 unicode 中文 العربية";
		const error = new FontError(unicodeMessage);
		expect(error.message).toContain(unicodeMessage);
	});

	it("should handle special characters in paths", () => {
		const specialPath = "path/with spaces/special-chars_123.jpg";
		const error = new MissingFileError(specialPath);
		expect(error.message).toContain(specialPath);
	});

	it("should handle very large validation error lists", () => {
		const errorList = createValidationErrorList();

		// Add many errors
		for (let i = 0; i < 1000; i++) {
			errorList.push(new MissingFieldError("Test", `field${i}`));
		}

		expect(errorList.errors).toHaveLength(1000);
		expect(errorList.isEmpty()).toBe(false);

		const errorString = errorList.toString();
		expect(errorString.split("\n")).toHaveLength(1000);
	});

	it("should handle null and undefined in error contexts", () => {
		expect(() => new InvalidTypeError(null)).not.toThrow();
		expect(() => new InvalidTypeError(undefined)).not.toThrow();

		const nullError = new InvalidTypeError(null);
		expect(nullError.message).toContain("null");

		const undefinedError = new InvalidTypeError(undefined);
		expect(undefinedError.message).toContain("Each tag must be an object");
	});
});
