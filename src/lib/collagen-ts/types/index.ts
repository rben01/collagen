/**
 * Core type definitions for Collagen TypeScript implementation
 *
 * This module defines the fundamental types used throughout the Collagen system,
 * including both unvalidated (from JSON) and validated (processed) versions.
 */

// =============================================================================
// Common Types
// =============================================================================

/** Manifest format specification */
export type ManifestFormat = "json" | "jsonnet";

/** XML attributes as key-value pairs */
export type XmlAttrs = Record<string, string | number>;

/** Font attribute value types */
export type FontAttr = string | number;

/** Map type for font attributes */
export type FontAttrs = Record<string, FontAttr>;

// =============================================================================
// Font Types
// =============================================================================

/** User-provided font face with file path */
export interface UserProvidedFontFace {
	name: string;
	path: string;
	attrs?: FontAttrs;
}

/** Bundled font face (built into Collagen) */
export interface BundledFontFace {
	name: string;
	attrs?: FontAttrs;
}

/** Font face union type */
export type FontFace = UserProvidedFontFace | BundledFontFace;

// Helper type guards for font faces
export function isUserProvidedFont(
	font: FontFace,
): font is UserProvidedFontFace {
	return "path" in font;
}

export function isBundledFont(font: FontFace): font is BundledFontFace {
	return !("path" in font);
}

// =============================================================================
// Validated Types (after processing)
// =============================================================================

/** Validated generic SVG tag */
export interface GenericTag {
	type: "generic";
	tagName: string;
	attrs: XmlAttrs;
	children: AnyChildTag[];
}

/** Validated image tag */
export interface ImageTag {
	type: "image";
	imagePath: string;
	kind?: string;
	attrs: XmlAttrs;
	children: AnyChildTag[];
}

/** Validated text tag */
export interface TextTag {
	type: "text";
	text: string;
	isPreescaped: boolean;
}

/** Validated container tag */
export interface ContainerTag {
	type: "container";
	clgnPath: string;
	// Note: Container tags don't have attrs or children directly
	// They get replaced by the contents of the nested folder
}

/** Validated font tag */
export interface FontTag {
	type: "font";
	fonts: FontFace[];
	attrs: XmlAttrs;
}

/** Validated nested SVG tag */
export interface NestedSvgTag {
	type: "nested-svg";
	svgPath: string;
	attrs: XmlAttrs;
}

/** Union of all validated child tag types */
export type AnyChildTag =
	| GenericTag
	| ImageTag
	| TextTag
	| ContainerTag
	| FontTag
	| NestedSvgTag;

/** Validated root tag */
export interface RootTag {
	type: "root";
	attrs: XmlAttrs;
	children: AnyChildTag[];
}

// =============================================================================
// Validation Interface
// =============================================================================

/** Error list for collecting validation errors */
export interface ValidationErrorList {
	errors: ValidationError[];
	push(error: ValidationError): void;
	isEmpty(): boolean;
}

/** Base validation error interface */
export interface ValidationError {
	errorType: string;
	message: string;
}

/** Interface for types that can be validated */
export interface Validatable<T> {
	validate(errors: ValidationErrorList): T;
}
