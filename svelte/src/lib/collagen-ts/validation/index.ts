/**
 * Validation framework for transforming unvalidated to validated types
 *
 * This module implements the validation logic that transforms raw JSON objects
 * into properly typed and validated Collagen tag structures.
 */

import type {
	XmlAttrs,
	FontFace,
	UnvalidatedAnyChildTag,
	UnvalidatedRootTag,
	AnyChildTag,
	RootTag,
	ValidationErrorList,
} from "../types/index.js";

import {
	createValidationErrorList,
	InvalidTypeError,
	UnexpectedKeysError,
	UnrecognizedObjectError,
	MissingFieldError,
	InvalidFieldTypeError,
	type ValidationErrorListImpl,
} from "../errors/index.js";

// =============================================================================
// Validation Utilities
// =============================================================================

/** Check if a value is a plain object */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Check if a value is a string */
function isString(value: unknown): value is string {
	return typeof value === "string";
}

/** Check if a value is a number */
function isNumber(value: unknown): value is number {
	return typeof value === "number" && !isNaN(value);
}

/** Check if a value is a boolean */
function isBoolean(value: unknown): value is boolean {
	return typeof value === "boolean";
}

/** Check if a value is an array */
function isArray(value: unknown): value is unknown[] {
	return Array.isArray(value);
}

/** Validate and convert XML attributes */
function validateXmlAttrs(
	value: unknown,
	tagType: string,
	errors: ValidationErrorListImpl,
): XmlAttrs {
	if (value === undefined || value === null) {
		return {};
	}

	if (!isPlainObject(value)) {
		errors.push(
			new InvalidFieldTypeError(tagType, "attrs", "object", typeof value),
		);
		return {};
	}

	const result: XmlAttrs = {};
	for (const [key, val] of Object.entries(value)) {
		if (isString(val) || isNumber(val)) {
			result[key] = val;
		} else {
			errors.push(
				new InvalidFieldTypeError(
					tagType,
					`attrs.${key}`,
					"string or number",
					typeof val,
				),
			);
		}
	}

	return result;
}

/** Validate children field (can be single child or array of children) */
function validateChildren(
	value: unknown,
	tagType: string,
	errors: ValidationErrorListImpl,
): AnyChildTag[] {
	if (value === undefined || value === null) {
		return [];
	}

	// Single child - wrap in array
	if (!isArray(value)) {
		const child = validateAnyChildTag(value, errors);
		return child ? [child] : [];
	}

	// Array of children
	const result: AnyChildTag[] = [];
	for (let i = 0; i < value.length; i++) {
		const child = validateAnyChildTag(value[i], errors);
		if (child) {
			result.push(child);
		}
	}

	return result;
}

/** Get unexpected keys for a tag */
function getUnexpectedKeys(
	obj: Record<string, unknown>,
	primaryKey: string,
	allowedKeys: string[],
): string[] {
	const allAllowedKeys = [primaryKey, ...allowedKeys];
	return Object.keys(obj).filter(key => !allAllowedKeys.includes(key));
}

// =============================================================================
// Font Validation
// =============================================================================

/** Validate a font face object */
function validateFontFace(
	value: unknown,
	errors: ValidationErrorListImpl,
): FontFace | null {
	if (!isPlainObject(value)) {
		errors.push(
			new InvalidFieldTypeError(
				"Font",
				"fonts[item]",
				"object",
				typeof value,
			),
		);
		return null;
	}

	// Name is required
	if (!("name" in value) || !isString(value.name)) {
		errors.push(new MissingFieldError("FontFace", "name"));
		return null;
	}

	const name = value.name;
	const bundled = isBoolean(value.bundled) ? value.bundled : false;

	// Validate attrs if present
	const attrs = validateFontAttrs(value.attrs, errors);

	if (bundled) {
		// Bundled font - should not have path
		if ("path" in value) {
			errors.push(
				new InvalidFieldTypeError(
					"FontFace",
					"bundled+path",
					"mutually exclusive",
					"both specified",
				),
			);
		}

		// Check for unexpected keys
		const unexpectedKeys = getUnexpectedKeys(value, "name", [
			"bundled",
			"attrs",
		]);
		if (unexpectedKeys.length > 0) {
			errors.push(
				new UnexpectedKeysError("BundledFontFace", unexpectedKeys),
			);
		}

		return { name, attrs };
	} else {
		// User-provided font - requires path
		if (!("path" in value) || !isString(value.path)) {
			errors.push(new MissingFieldError("FontFace", "path"));
			return null;
		}

		// Check for unexpected keys
		const unexpectedKeys = getUnexpectedKeys(value, "name", [
			"path",
			"bundled",
			"attrs",
		]);
		if (unexpectedKeys.length > 0) {
			errors.push(
				new UnexpectedKeysError("UserProvidedFontFace", unexpectedKeys),
			);
		}

		return { name, path: value.path, attrs };
	}
}

/** Validate font attributes */
function validateFontAttrs(
	value: unknown,
	errors: ValidationErrorListImpl,
): Record<string, string | number> {
	if (value === undefined || value === null) {
		return {};
	}

	if (!isPlainObject(value)) {
		errors.push(
			new InvalidFieldTypeError("FontFace", "attrs", "object", typeof value),
		);
		return {};
	}

	const result: Record<string, string | number> = {};
	for (const [key, val] of Object.entries(value)) {
		if (isString(val) || isNumber(val)) {
			result[key] = val;
		} else {
			errors.push(
				new InvalidFieldTypeError(
					"FontFace",
					`attrs.${key}`,
					"string or number",
					typeof val,
				),
			);
		}
	}

	return result;
}

// =============================================================================
// Tag Validation Functions
// =============================================================================

/** Validate a generic tag */
function validateGenericTag(
	obj: Record<string, unknown>,
	errors: ValidationErrorListImpl,
): AnyChildTag | null {
	if (!isString(obj.tag)) {
		errors.push(
			new InvalidFieldTypeError("Generic", "tag", "string", typeof obj.tag),
		);
		return null;
	}

	const tagName = obj.tag;
	const attrs = validateXmlAttrs(obj.attrs, "Generic", errors);
	const children = validateChildren(obj.children, "Generic", errors);

	// Check for unexpected keys
	const unexpectedKeys = getUnexpectedKeys(obj, "tag", ["attrs", "children"]);
	if (unexpectedKeys.length > 0) {
		errors.push(new UnexpectedKeysError("Generic", unexpectedKeys));
	}

	return { type: "generic", tagName, attrs, children };
}

/** Validate an image tag */
function validateImageTag(
	obj: Record<string, unknown>,
	errors: ValidationErrorListImpl,
): AnyChildTag | null {
	if (!isString(obj.image_path)) {
		errors.push(
			new InvalidFieldTypeError(
				"Image",
				"image_path",
				"string",
				typeof obj.image_path,
			),
		);
		return null;
	}

	const imagePath = obj.image_path;
	const kind = isString(obj.kind) ? obj.kind : undefined;
	const attrs = validateXmlAttrs(obj.attrs, "Image", errors);
	const children = validateChildren(obj.children, "Image", errors);

	// Check for unexpected keys
	const unexpectedKeys = getUnexpectedKeys(obj, "image_path", [
		"kind",
		"attrs",
		"children",
	]);
	if (unexpectedKeys.length > 0) {
		errors.push(new UnexpectedKeysError("Image", unexpectedKeys));
	}

	return { type: "image", imagePath, kind, attrs, children };
}

/** Validate a text tag */
function validateTextTag(
	obj: Record<string, unknown> | string,
	errors: ValidationErrorListImpl,
): AnyChildTag | null {
	// Handle string form
	if (isString(obj)) {
		return { type: "text", text: obj, isPreescaped: false };
	}

	if (!isPlainObject(obj)) {
		errors.push(new InvalidTypeError(obj));
		return null;
	}

	if (!isString(obj.text)) {
		errors.push(
			new InvalidFieldTypeError("Text", "text", "string", typeof obj.text),
		);
		return null;
	}

	const text = obj.text;
	const isPreescaped = isBoolean(obj.is_preescaped)
		? obj.is_preescaped
		: false;

	// Check for unexpected keys
	const unexpectedKeys = getUnexpectedKeys(obj, "text", ["is_preescaped"]);
	if (unexpectedKeys.length > 0) {
		errors.push(new UnexpectedKeysError("Text", unexpectedKeys));
	}

	return { type: "text", text, isPreescaped };
}

/** Validate a container tag */
function validateContainerTag(
	obj: Record<string, unknown>,
	errors: ValidationErrorListImpl,
): AnyChildTag | null {
	if (!isString(obj.clgn_path)) {
		errors.push(
			new InvalidFieldTypeError(
				"Container",
				"clgn_path",
				"string",
				typeof obj.clgn_path,
			),
		);
		return null;
	}

	const clgnPath = obj.clgn_path;

	// Check for unexpected keys (container tags don't accept attrs or children)
	const unexpectedKeys = getUnexpectedKeys(obj, "clgn_path", []);
	if (unexpectedKeys.length > 0) {
		errors.push(new UnexpectedKeysError("Container", unexpectedKeys));
	}

	return { type: "container", clgnPath };
}

/** Validate a font tag */
function validateFontTag(
	obj: Record<string, unknown>,
	errors: ValidationErrorListImpl,
): AnyChildTag | null {
	if (!isArray(obj.fonts)) {
		errors.push(
			new InvalidFieldTypeError("Font", "fonts", "array", typeof obj.fonts),
		);
		return null;
	}

	const fonts: FontFace[] = [];
	for (let i = 0; i < obj.fonts.length; i++) {
		const font = validateFontFace(obj.fonts[i], errors);
		if (font) {
			fonts.push(font);
		}
	}

	const attrs = validateXmlAttrs(obj.attrs, "Font", errors);

	// Check for unexpected keys
	const unexpectedKeys = getUnexpectedKeys(obj, "fonts", ["attrs"]);
	if (unexpectedKeys.length > 0) {
		errors.push(new UnexpectedKeysError("Font", unexpectedKeys));
	}

	return { type: "font", fonts, attrs };
}

/** Validate a nested SVG tag */
function validateNestedSvgTag(
	obj: Record<string, unknown>,
	errors: ValidationErrorListImpl,
): AnyChildTag | null {
	if (!isString(obj.svg_path)) {
		errors.push(
			new InvalidFieldTypeError(
				"NestedSvg",
				"svg_path",
				"string",
				typeof obj.svg_path,
			),
		);
		return null;
	}

	const svgPath = obj.svg_path;
	const attrs = validateXmlAttrs(obj.attrs, "NestedSvg", errors);

	// Check for unexpected keys
	const unexpectedKeys = getUnexpectedKeys(obj, "svg_path", ["attrs"]);
	if (unexpectedKeys.length > 0) {
		errors.push(new UnexpectedKeysError("NestedSvg", unexpectedKeys));
	}

	return { type: "nested-svg", svgPath, attrs };
}

// =============================================================================
// Main Validation Functions
// =============================================================================

/** Validate any child tag */
export function validateAnyChildTag(
	value: UnvalidatedAnyChildTag,
	errors: ValidationErrorListImpl,
): AnyChildTag | null {
	// Handle string form (for TextTag)
	if (isString(value)) {
		return validateTextTag(value, errors);
	}

	if (!isPlainObject(value)) {
		errors.push(new InvalidTypeError(value));
		return null;
	}

	// Determine tag type by primary key
	if ("tag" in value) {
		return validateGenericTag(value, errors);
	} else if ("image_path" in value) {
		return validateImageTag(value, errors);
	} else if ("text" in value) {
		return validateTextTag(value, errors);
	} else if ("clgn_path" in value) {
		return validateContainerTag(value, errors);
	} else if ("fonts" in value) {
		return validateFontTag(value, errors);
	} else if ("svg_path" in value) {
		return validateNestedSvgTag(value, errors);
	} else {
		errors.push(new UnrecognizedObjectError(value));
		return null;
	}
}

/** Validate root tag */
export function validateRootTag(value: UnvalidatedRootTag): RootTag {
	const errors = createValidationErrorList();

	const attrs = validateXmlAttrs(value.attrs, "Root", errors);
	const children = validateChildren(value.children, "Root", errors);

	// Check for unexpected keys (root only accepts attrs and children)
	const unexpectedKeys = Object.keys(value).filter(
		key => !["attrs", "children"].includes(key),
	);
	if (unexpectedKeys.length > 0) {
		errors.push(new UnexpectedKeysError("Root", unexpectedKeys));
	}

	errors.throwIfErrors();

	return { type: "root", attrs, children };
}

/** Validate a complete document from JSON */
export function validateDocument(json: unknown): RootTag {
	if (!isPlainObject(json)) {
		throw new InvalidTypeError(json);
	}

	return validateRootTag(json);
}
