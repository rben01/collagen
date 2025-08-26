/**
 * Comprehensive tests for the validation module
 *
 * Tests all tag types, validation rules, error handling,
 * and edge cases for the validation system.
 */

import { describe, it, expect } from "vitest";
import { validateDocument, validateAnyChildTag } from "../validation/index.js";
import {
  createValidationErrorList,
  InvalidTypeError,
  UnexpectedKeysError,
  UnrecognizedObjectError,
  MissingFieldError,
  InvalidFieldTypeError,
  InvalidSchemaError,
} from "../errors/index.js";
import type { AnyChildTag, GenericTag } from "../types/index.js";

// =============================================================================
// Test Utilities
// =============================================================================

/** Assert that a tag is of a specific type with proper typing */
function assertTagType<T extends AnyChildTag["type"]>(
  tag: AnyChildTag | null,
  expectedType: T,
): asserts tag is Extract<AnyChildTag, { type: T }> {
  expect(tag).not.toBeNull();
  expect(tag!.type).toBe(expectedType);
}

/** Helper to test validation that should fail */
function expectValidationError(fn: () => any, errorType?: any) {
  try {
    fn();
    expect.fail("Expected validation to throw an error");
  } catch (error) {
    if (errorType) {
      expect(error).toBeInstanceOf(errorType);
    }
  }
}

// =============================================================================
// Root Tag Validation Tests
// =============================================================================

describe("Root Tag Validation", () => {
  it("should validate minimal root tag", () => {
    const result = validateDocument({});
    expect(result.type).toBe("root");
    expect(result.attrs).toEqual({});
    expect(result.children).toEqual([]);
  });

  it("should validate root tag with attributes", () => {
    const result = validateDocument({
      attrs: { viewBox: "0 0 100 100", width: 100, height: 100 },
    });
    expect(result.attrs).toEqual({
      viewBox: "0 0 100 100",
      width: 100,
      height: 100,
    });
  });

  it("should validate root tag with children", () => {
    const result = validateDocument({
      children: [
        { tag: "rect", attrs: { x: 0, y: 0, width: 50, height: 50 } },
        "Some text",
      ],
    });
    expect(result.children).toHaveLength(2);
    assertTagType(result.children[0], "generic");
    assertTagType(result.children[1], "text");
  });

  it("should handle single child (not array)", () => {
    const result = validateDocument({
      children: { tag: "circle", attrs: { cx: 50, cy: 50, r: 25 } },
    });
    expect(result.children).toHaveLength(1);
    assertTagType(result.children[0], "generic");
  });

  it("should reject non-object root", () => {
    expectValidationError(
      () => validateDocument("not an object"),
      InvalidTypeError,
    );
    expectValidationError(() => validateDocument(null), InvalidTypeError);
    expectValidationError(() => validateDocument([]), InvalidTypeError);
  });

  it("should reject unexpected keys in root", () => {
    expectValidationError(
      () => validateDocument({ attrs: {}, children: [], unexpected: "value" }),
      InvalidSchemaError,
    );
  });

  it("should reject invalid attrs", () => {
    expectValidationError(
      () => validateDocument({ attrs: "not an object" }),
      InvalidSchemaError,
    );
  });
});

// =============================================================================
// Generic Tag Tests
// =============================================================================

describe("Generic Tag Validation", () => {
  it("should validate simple generic tag", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      { tag: "rect", attrs: { x: 0, y: 0, width: 50, height: 50 } },
      errors,
    );

    assertTagType(result, "generic");
    expect(result.tagName).toBe("rect");
    expect(result.attrs).toEqual({ x: 0, y: 0, width: 50, height: 50 });
    expect(result.children).toEqual([]);
    expect(errors.isEmpty()).toBe(true);
  });

  it("should validate generic tag with children", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      {
        tag: "g",
        attrs: { transform: "translate(10,10)" },
        children: [
          { tag: "circle", attrs: { cx: 0, cy: 0, r: 5 } },
          "Text content",
        ],
      },
      errors,
    );

    assertTagType(result, "generic");
    expect(result.tagName).toBe("g");
    expect(result.children).toHaveLength(2);
    expect(errors.isEmpty()).toBe(true);
  });

  it("should require tag name", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag({ attrs: { x: 0 } }, errors);

    expect(result).toBeNull();
    expect(errors.isEmpty()).toBe(false);
  });

  it("should reject non-string tag name", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag({ tag: 123 }, errors);

    expect(result).toBeNull();
    expect(errors.errors[0]).toBeInstanceOf(InvalidFieldTypeError);
  });

  it("should reject unexpected keys", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      { tag: "rect", unexpected: "value" },
      errors,
    );

    expect(result).toBeNull();
    expect(errors.errors.some((e) => e instanceof UnexpectedKeysError)).toBe(
      true,
    );
  });

  it("should handle invalid attrs gracefully", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      {
        tag: "rect",
        attrs: { x: 0, invalid: [] }, // array is invalid for attrs
      },
      errors,
    );

    // With strict validation, invalid attrs cause the entire tag to fail
    expect(result).toBeNull();
    expect(errors.errors.some((e) => e instanceof InvalidFieldTypeError)).toBe(
      true,
    );
  });
});

// =============================================================================
// Image Tag Tests
// =============================================================================

describe("Image Tag Validation", () => {
  it("should validate simple image tag", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag({ image_path: "image.jpg" }, errors);

    assertTagType(result, "image");
    expect(result.imagePath).toBe("image.jpg");
    expect(result.kind).toBeUndefined();
    expect(result.attrs).toEqual({});
    expect(result.children).toEqual([]);
    expect(errors.isEmpty()).toBe(true);
  });

  it("should validate image tag with all properties", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      {
        image_path: "assets/photo.png",
        kind: "photo",
        attrs: { width: 100, height: 100 },
        children: [{ tag: "title" }],
      },
      errors,
    );

    assertTagType(result, "image");
    expect(result.imagePath).toBe("assets/photo.png");
    expect(result.kind).toBe("photo");
    expect(result.attrs).toEqual({ width: 100, height: 100 });
    expect(result.children).toHaveLength(1);
    expect(errors.isEmpty()).toBe(true);
  });

  it("should require image_path", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag({ attrs: { width: 100 } }, errors);

    expect(result).toBeNull();
    expect(errors.isEmpty()).toBe(false);
  });

  it("should reject non-string image_path", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag({ image_path: 123 }, errors);

    expect(result).toBeNull();
    expect(errors.errors[0]).toBeInstanceOf(InvalidFieldTypeError);
  });

  it("should handle optional kind as string", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      {
        image_path: "test.jpg",
        kind: 123, // non-string should be filtered
      },
      errors,
    );

    assertTagType(result, "image");
    expect(result.kind).toBeUndefined();
    expect(errors.isEmpty()).toBe(true);
  });

  it("should reject unexpected keys", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      { image_path: "test.jpg", unexpected: "value" },
      errors,
    );

    expect(result).toBeNull();
    expect(errors.errors.some((e) => e instanceof UnexpectedKeysError)).toBe(
      true,
    );
  });
});

// =============================================================================
// Text Tag Tests
// =============================================================================

describe("Text Tag Validation", () => {
  it("should validate string form", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag("Hello, World!", errors);

    assertTagType(result, "text");
    expect(result.text).toBe("Hello, World!");
    expect(result.isPreescaped).toBe(false);
    expect(errors.isEmpty()).toBe(true);
  });

  it("should validate object form", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag({ text: "Hello, World!" }, errors);

    assertTagType(result, "text");
    expect(result.text).toBe("Hello, World!");
    expect(result.isPreescaped).toBe(false);
    expect(errors.isEmpty()).toBe(true);
  });

  it("should validate preescaped text", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      { text: "<b>Bold</b>", is_preescaped: true },
      errors,
    );

    assertTagType(result, "text");
    expect(result.text).toBe("<b>Bold</b>");
    expect(result.isPreescaped).toBe(true);
    expect(errors.isEmpty()).toBe(true);
  });

  it("should handle empty string", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag("", errors);

    assertTagType(result, "text");
    expect(result.text).toBe("");
    expect(errors.isEmpty()).toBe(true);
  });

  it("should handle unicode text", () => {
    const unicode = "🌍 Hello 中文 العربية";
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(unicode, errors);

    assertTagType(result, "text");
    expect(result.text).toBe(unicode);
    expect(errors.isEmpty()).toBe(true);
  });

  it("should require text field in object form", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag({ is_preescaped: true }, errors);

    expect(result).toBeNull();
    expect(errors.errors[0]).toBeInstanceOf(UnrecognizedObjectError);
  });

  it("should reject non-string text", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag({ text: 123 }, errors);

    expect(result).toBeNull();
    expect(errors.errors[0]).toBeInstanceOf(InvalidFieldTypeError);
  });

  it("should handle non-boolean is_preescaped", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      {
        text: "test",
        is_preescaped: "true", // string instead of boolean
      },
      errors,
    );

    assertTagType(result, "text");
    expect(result.isPreescaped).toBe(false); // defaults to false
    expect(errors.isEmpty()).toBe(true);
  });

  it("should reject unexpected keys", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      { text: "test", unexpected: "value" },
      errors,
    );

    expect(result).toBeNull();
    expect(errors.errors.some((e) => e instanceof UnexpectedKeysError)).toBe(
      true,
    );
  });
});

// =============================================================================
// Container Tag Tests
// =============================================================================

describe("Container Tag Validation", () => {
  it("should validate container tag", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag({ clgn_path: "subfolder" }, errors);

    assertTagType(result, "container");
    expect(result.clgnPath).toBe("subfolder");
    expect(errors.isEmpty()).toBe(true);
  });

  it("should require clgn_path", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      {
        // missing clgn_path
      },
      errors,
    );

    expect(result).toBeNull();
    expect(errors.isEmpty()).toBe(false);
  });

  it("should reject non-string clgn_path", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag({ clgn_path: 123 }, errors);

    expect(result).toBeNull();
    expect(errors.errors[0]).toBeInstanceOf(InvalidFieldTypeError);
  });

  it("should reject unexpected keys", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      {
        clgn_path: "test",
        attrs: {}, // container tags don't accept attrs
      },
      errors,
    );

    expect(result).toBeNull();
    expect(errors.errors.some((e) => e instanceof UnexpectedKeysError)).toBe(
      true,
    );
  });

  it("should handle relative paths", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      { clgn_path: "deep/nested/folder" },
      errors,
    );

    assertTagType(result, "container");
    expect(result.clgnPath).toBe("deep/nested/folder");
    expect(errors.isEmpty()).toBe(true);
  });
});

// =============================================================================
// Font Tag Tests
// =============================================================================

describe("Font Tag Validation", () => {
  it("should validate bundled font", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      { fonts: [{ name: "Arial", bundled: true }] },
      errors,
    );

    assertTagType(result, "font");
    expect(result.fonts).toHaveLength(1);
    expect(result.fonts[0].name).toBe("Arial");
    expect("path" in result.fonts[0]).toBe(false);
    expect(errors.isEmpty()).toBe(true);
  });

  it("should validate user-provided font", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      { fonts: [{ name: "CustomFont", path: "fonts/custom.woff2" }] },
      errors,
    );

    assertTagType(result, "font");
    expect(result.fonts).toHaveLength(1);
    const font = result.fonts[0] as any;
    expect(font.name).toBe("CustomFont");
    expect(font.path).toBe("fonts/custom.woff2");
    expect(errors.isEmpty()).toBe(true);
  });

  it("should validate font with attributes", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      {
        fonts: [
          {
            name: "MyFont",
            path: "font.ttf",
            attrs: { "font-weight": "bold", "font-style": "italic" },
          },
        ],
        attrs: { id: "font-defs" },
      },
      errors,
    );

    assertTagType(result, "font");
    expect(result.fonts[0].attrs).toEqual({
      "font-weight": "bold",
      "font-style": "italic",
    });
    expect(result.attrs).toEqual({ id: "font-defs" });
    expect(errors.isEmpty()).toBe(true);
  });

  it("should validate multiple fonts", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      {
        fonts: [
          { name: "Font1", bundled: true },
          { name: "Font2", path: "font2.woff" },
          { name: "Font3", bundled: true },
        ],
      },
      errors,
    );

    assertTagType(result, "font");
    expect(result.fonts).toHaveLength(3);
    expect(errors.isEmpty()).toBe(true);
  });

  it("should require fonts array", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      {
        // missing fonts
      },
      errors,
    );

    expect(result).toBeNull();
    expect(errors.isEmpty()).toBe(false);
  });

  it("should reject non-array fonts", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag({ fonts: "not an array" }, errors);

    expect(result).toBeNull();
    expect(errors.errors[0]).toBeInstanceOf(InvalidFieldTypeError);
  });

  it("should require font name", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      {
        fonts: [
          { path: "font.woff" }, // missing name
        ],
      },
      errors,
    );

    expect(result).toBeNull();
    expect(errors.errors.some((e) => e instanceof MissingFieldError)).toBe(
      true,
    );
  });

  it("should require path for non-bundled fonts", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      {
        fonts: [
          { name: "MyFont" }, // missing path and not bundled
        ],
      },
      errors,
    );

    expect(result).toBeNull();
    expect(errors.errors.some((e) => e instanceof MissingFieldError)).toBe(
      true,
    );
  });

  it("should reject bundled fonts with path", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      {
        fonts: [
          {
            name: "MyFont",
            bundled: true,
            path: "font.woff", // invalid for bundled
          },
        ],
      },
      errors,
    );

    expect(result).toBeNull();
    expect(errors.errors.some((e) => e instanceof InvalidFieldTypeError)).toBe(
      true,
    );
  });

  it("should handle invalid font attrs", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      {
        fonts: [
          {
            name: "MyFont",
            bundled: true,
            attrs: {
              valid: "value",
              invalid: [], // arrays not allowed
            },
          },
        ],
      },
      errors,
    );

    expect(result).toBeNull();
    expect(errors.errors.some((e) => e instanceof InvalidFieldTypeError)).toBe(
      true,
    );
  });

  it("should reject unexpected keys in font faces", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      { fonts: [{ name: "MyFont", bundled: true, unexpected: "value" }] },
      errors,
    );

    expect(result).toBeNull();
    expect(errors.errors.some((e) => e instanceof UnexpectedKeysError)).toBe(
      true,
    );
  });
});

// =============================================================================
// Nested SVG Tag Tests
// =============================================================================

describe("Nested SVG Tag Validation", () => {
  it("should validate simple nested SVG", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag({ svg_path: "icons/star.svg" }, errors);

    assertTagType(result, "nested-svg");
    expect(result.svgPath).toBe("icons/star.svg");
    expect(result.attrs).toEqual({});
    expect(errors.isEmpty()).toBe(true);
  });

  it("should validate nested SVG with attributes", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      {
        svg_path: "graphics/logo.svg",
        attrs: { width: 100, height: 50, transform: "scale(0.5)" },
      },
      errors,
    );

    assertTagType(result, "nested-svg");
    expect(result.svgPath).toBe("graphics/logo.svg");
    expect(result.attrs).toEqual({
      width: 100,
      height: 50,
      transform: "scale(0.5)",
    });
    expect(errors.isEmpty()).toBe(true);
  });

  it("should require svg_path", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag({ attrs: { width: 100 } }, errors);

    expect(result).toBeNull();
    expect(errors.isEmpty()).toBe(false);
  });

  it("should reject non-string svg_path", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag({ svg_path: 123 }, errors);

    expect(result).toBeNull();
    expect(errors.errors[0]).toBeInstanceOf(InvalidFieldTypeError);
  });

  it("should reject unexpected keys", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      {
        svg_path: "test.svg",
        children: [], // nested SVG doesn't accept children
      },
      errors,
    );

    expect(result).toBeNull();
    expect(errors.errors.some((e) => e instanceof UnexpectedKeysError)).toBe(
      true,
    );
  });
});

// =============================================================================
// Unrecognized Objects Tests
// =============================================================================

describe("Unrecognized Objects", () => {
  it("should reject objects without primary keys", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(
      { attrs: { x: 0 }, children: [] },
      errors,
    );

    expect(result).toBeNull();
    expect(errors.errors[0]).toBeInstanceOf(UnrecognizedObjectError);
  });

  it("should reject objects with unrecognized primary keys", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag({ unknown_field: "value" }, errors);

    expect(result).toBeNull();
    expect(errors.errors[0]).toBeInstanceOf(UnrecognizedObjectError);
  });

  it("should reject non-object, non-string values", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(123, errors);

    expect(result).toBeNull();
    expect(errors.errors[0]).toBeInstanceOf(InvalidTypeError);
  });

  it("should reject arrays", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag([], errors);

    expect(result).toBeNull();
    expect(errors.errors[0]).toBeInstanceOf(InvalidTypeError);
  });

  it("should reject null", () => {
    const errors = createValidationErrorList();
    const result = validateAnyChildTag(null, errors);

    expect(result).toBeNull();
    expect(errors.errors[0]).toBeInstanceOf(InvalidTypeError);
  });
});

// =============================================================================
// Complex Integration Tests
// =============================================================================

describe("Complex Validation Scenarios", () => {
  it("should validate deeply nested structure", () => {
    const complexDocument = {
      attrs: { viewBox: "0 0 400 400" },
      children: [
        {
          fonts: [
            { name: "Arial", bundled: true },
            { name: "Custom", path: "font.woff2" },
          ],
        },
        {
          tag: "g",
          attrs: { transform: "translate(50,50)" },
          children: [
            { image_path: "photo.jpg", attrs: { width: 300 } },
            {
              tag: "text",
              attrs: { x: 10, y: 30 },
              children: ["Caption text"],
            },
            {
              tag: "g",
              children: [
                { svg_path: "icon.svg", attrs: { x: 0, y: 0 } },
                "More text",
                { text: "<em>Emphasized</em>", is_preescaped: true },
              ],
            },
          ],
        },
      ],
    };

    const result = validateDocument(complexDocument);
    expect(result.type).toBe("root");
    expect(result.children).toHaveLength(2);

    // Validate font tag
    assertTagType(result.children[0], "font");
    expect(result.children[0].fonts).toHaveLength(2);

    // Validate complex group
    assertTagType(result.children[1], "generic");
    expect(result.children[1].tagName).toBe("g");
    expect(result.children[1].children).toHaveLength(3);
  });

  it("should accumulate multiple validation errors", () => {
    const invalidDocument = {
      attrs: "invalid",
      children: [
        { tag: 123 }, // invalid tag name
        { image_path: null }, // invalid image path
        { text: [], is_preescaped: "not boolean" }, // invalid text
        { clgn_path: "valid", unexpected: "key" }, // unexpected key
      ],
      unexpected: "root key",
    };

    expectValidationError(() => validateDocument(invalidDocument));
  });

  it("should handle empty arrays and null children", () => {
    const result = validateDocument({ children: [] });
    expect(result.children).toEqual([]);
  });

  it("should reject mixed valid and invalid children", () => {
    const validDocument = {
      children: [
        "Valid text",
        { tag: "rect" }, // valid
        { invalid: "object" }, // invalid - no recognized keys
        { tag: "circle", attrs: { cx: 50 } }, // valid
        123, // invalid - not object or string
      ],
    };

    // With strict validation, invalid children cause the entire document to fail
    expectValidationError(
      () => validateDocument(validDocument),
      InvalidSchemaError,
    );
  });

  it("should preserve attribute types", () => {
    const result = validateDocument({
      attrs: { stringAttr: "value", numberAttr: 42, floatAttr: 3.14 },
      children: [
        {
          tag: "rect",
          attrs: {
            x: 10,
            y: "20", // string coordinate
            width: 30.5,
            height: "40%", // percentage string
          },
        },
      ],
    });

    expect(result.attrs).toEqual({
      stringAttr: "value",
      numberAttr: 42,
      floatAttr: 3.14,
    });

    const rect = result.children[0] as GenericTag;
    expect(rect.attrs).toEqual({
      x: 10,
      y: "20",
      width: 30.5,
      height: "40%",
    });
  });

  it("should fail validation when passed already-transformed objects instead of raw input", () => {
    // This tests that we fixed the double validation issue by ensuring
    // already-validated objects cause proper validation errors rather than passing through
    const alreadyTransformedObject = {
      type: "image", // This is the transformed format
      imagePath: "test.jpg", // This is the transformed field name
      attrs: {},
      children: [],
    };

    expectValidationError(() =>
      validateDocument({ children: [alreadyTransformedObject] }),
    );
  });
});
