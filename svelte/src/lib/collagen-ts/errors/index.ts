/**
 * Error types and handling for Collagen TypeScript implementation
 *
 * This module mirrors the Rust error system to provide consistent error handling
 * and user-friendly error messages.
 */

import type { ValidationErrorList } from "../types/index.js";

// =============================================================================
// Base Error Types
// =============================================================================

/** Base class for all Collagen errors */
export abstract class CollagenError extends Error {
	abstract readonly errorType: string;

	constructor(message: string) {
		super(message);
		this.name = this.constructor.name;
	}
}

// =============================================================================
// Validation Errors
// =============================================================================

/** Invalid type error (non-object where object expected) */
export class InvalidTypeError extends CollagenError {
	readonly errorType = "InvalidType";

	constructor(value: unknown) {
		let valueStr: string;
		try {
			valueStr = JSON.stringify(value);
		} catch (error) {
			// Handle circular references safely
			valueStr =
				typeof value === "object" && value !== null
					? "[object with circular reference]"
					: String(value);
		}
		super(`Each tag must be an object; got: ${valueStr}`);
	}
}

/** Unexpected keys error */
export class UnexpectedKeysError extends CollagenError {
	readonly errorType = "UnexpectedKeys";

	constructor(tagName: string, keys: string[]) {
		super(`Unexpected keys for tag "${tagName}": ${keys.join(", ")}`);
	}
}

/** Unrecognized object error */
export class UnrecognizedObjectError extends CollagenError {
	readonly errorType = "UnrecognizedObject";

	constructor(obj: Record<string, unknown>) {
		const objStr = JSON.stringify(obj, null, 2);
		let message = `The following object did not match any known schema:\n${objStr}\n`;

		// Provide helpful guidance based on detected keys
		const keys = Object.keys(obj);
		const knownPrimaryKeys = [
			"tag",
			"image_path",
			"text",
			"clgn_path",
			"fonts",
			"svg_path",
		];
		const foundPrimaryKeys = keys.filter(k => knownPrimaryKeys.includes(k));

		if (foundPrimaryKeys.length === 1) {
			const primaryKey = foundPrimaryKeys[0];
			const tagType = getTagTypeForPrimaryKey(primaryKey);
			message += `\nThe presence of key "${primaryKey}" suggests this is a ${tagType} tag.`;
			message += `\nCheck that all required fields are present and values are the correct type.`;
		} else if (foundPrimaryKeys.length > 1) {
			message += `\nMultiple primary keys found: ${foundPrimaryKeys.join(", ")}.`;
			message += `\nEach tag must have exactly one primary key.`;
		} else {
			message += `\nNo recognized primary key found.`;
			message += `\nTags must have one of: ${knownPrimaryKeys.join(", ")}.`;
		}

		message += `\n\nFor detailed schema documentation, see: https://docs.rs/collagen/latest/collagen/fibroblast/tags/enum.AnyChildTag.html`;

		super(message);
	}
}

/** Missing required field error */
export class MissingFieldError extends CollagenError {
	readonly errorType = "MissingField";

	constructor(tagType: string, fieldName: string) {
		super(`Missing required field "${fieldName}" for ${tagType} tag`);
	}
}

/** Invalid field type error */
export class InvalidFieldTypeError extends CollagenError {
	readonly errorType = "InvalidFieldType";

	constructor(
		tagType: string,
		fieldName: string,
		expectedType: string,
		actualType: string,
	) {
		super(
			`Invalid type for field "${fieldName}" in ${tagType} tag: expected ${expectedType}, got ${actualType}`,
		);
	}
}

// =============================================================================
// File System Errors
// =============================================================================

/** Missing manifest file error */
export class MissingManifestError extends CollagenError {
	readonly errorType = "MissingManifest";

	constructor() {
		super(
			"Missing manifest file; must provide either collagen.jsonnet or collagen.json",
		);
	}
}

/** Invalid path error */
export class InvalidPathError extends CollagenError {
	readonly errorType = "InvalidPath";

	constructor(path: string) {
		super(`Paths may not begin with a '/'; got "${path}"`);
	}
}

/** Missing file error */
export class MissingFileError extends CollagenError {
	readonly errorType = "MissingFile";

	constructor(path: string) {
		super(`Missing file at path: ${path}`);
	}
}

/** File read error */
export class FileReadError extends CollagenError {
	readonly errorType = "FileRead";

	constructor(path: string, cause?: string) {
		const message = cause
			? `Error reading file "${path}": ${cause}`
			: `Error reading file "${path}"`;
		super(message);
	}
}

// =============================================================================
// Processing Errors
// =============================================================================

/** Image processing error */
export class ImageError extends CollagenError {
	readonly errorType = "Image";

	constructor(message: string) {
		super(`Error processing image: ${message}`);
	}
}

/** Font error */
export class FontError extends CollagenError {
	readonly errorType = "Font";

	constructor(message: string) {
		super(`Error processing font: ${message}`);
	}
}

/** Bundled font not found error */
export class BundledFontNotFoundError extends CollagenError {
	readonly errorType = "BundledFontNotFound";

	constructor(fontName: string) {
		super(`Could not find bundled font "${fontName}"`);
	}
}

/** XML generation error */
export class XmlError extends CollagenError {
	readonly errorType = "Xml";

	constructor(message: string) {
		super(`XML error: ${message}`);
	}
}

/** JSON parsing error */
export class JsonError extends CollagenError {
	readonly errorType = "Json";

	constructor(path: string, cause: string) {
		super(`Failed to parse JSON at "${path}": ${cause}`);
	}
}

/** Jsonnet compilation error */
export class JsonnetError extends CollagenError {
	readonly errorType = "Jsonnet";

	constructor(path: string, cause: string) {
		super(`Error reading "${path}" as jsonnet: ${cause}`);
	}
}

// =============================================================================
// Validation Error List Implementation
// =============================================================================

/** Implementation of ValidationErrorList */
export class ValidationErrorListImpl implements ValidationErrorList {
	errors: CollagenError[] = [];

	push(error: CollagenError): void {
		this.errors.push(error);
	}

	isEmpty(): boolean {
		return this.errors.length === 0;
	}

	/** Throw a combined error if any errors exist */
	throwIfErrors(): void {
		if (!this.isEmpty()) {
			throw new InvalidSchemaError(this);
		}
	}

	/** Get error messages as a formatted string */
	toString(): string {
		return this.errors.map(e => e.message).join("\n");
	}
}

/** Schema validation error that wraps multiple validation errors */
export class InvalidSchemaError extends CollagenError {
	readonly errorType = "InvalidSchema";
	readonly validationErrors: CollagenError[];

	constructor(errorList: ValidationErrorListImpl) {
		const message = `Invalid schema:\n${errorList.toString()}`;
		super(message);
		this.validationErrors = [...errorList.errors];
	}
}

// =============================================================================
// Helper Functions
// =============================================================================

/** Get tag type name from primary key */
function getTagTypeForPrimaryKey(primaryKey: string): string {
	switch (primaryKey) {
		case "tag":
			return "Generic";
		case "image_path":
			return "Image";
		case "text":
			return "Text";
		case "clgn_path":
			return "Container";
		case "fonts":
			return "Font";
		case "svg_path":
			return "NestedSvg";
		default:
			return "Unknown";
	}
}

/** Create a new validation error list */
export function createValidationErrorList(): ValidationErrorListImpl {
	return new ValidationErrorListImpl();
}

/** Type guard to check if an error is a Collagen error */
export function isCollagenError(error: unknown): error is CollagenError {
	return error instanceof CollagenError;
}

/** Get user-friendly error message with type information */
export function formatError(error: unknown): string {
	if (isCollagenError(error)) {
		return error.message;
	}

	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
