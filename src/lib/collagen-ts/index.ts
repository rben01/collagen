/**
 * Main API for Collagen TypeScript implementation
 *
 * This module provides the main entry point for the TypeScript version of Collagen.
 */

// =============================================================================
// Re-exports
// =============================================================================

// Export main types
export type {
	RootTag,
	AnyChildTag,
	GenericTag,
	ImageTag,
	TextTag,
	ContainerTag,
	FontTag,
	NestedSvgTag,
	XmlAttrs,
	FontFace,
	ManifestFormat,
} from "./types/index.js";

export { InMemoryFileSystem } from "./filesystem/index.js";
export type { FileContent } from "./filesystem/index.js";

// Export filesystem utilities
export {
	normalizedPathJoin,
	isImagePath,
	isFontPath,
	getFileExtension,
	getMimeType,
} from "./filesystem/index.js";

// Export validation
export { validateDocument, validateAnyChildTag } from "./validation/index.js";

// Export SVG generation
export { generateSvg } from "./svg/index.js";

// Export utilities
export { base64Encode, escapeXml, ensureArray } from "./utils/index.js";

// Export errors
export * from "./errors/index.js";

// Export Jsonnet utilities
export { compileJsonnet } from "./jsonnet/index.js";
export type { JsonnetConfig } from "./jsonnet/sjsonnet.js";

// =============================================================================
// Compatibility Layer
// =============================================================================

/**
 * General error type
 */
export interface CollagenError {
	message: string;
	errorType: string;
}

/**
 * Convert our errors to WASM-compatible format
 */
export function toCollagenError(error: unknown): CollagenError {
	if (error && typeof error === "object" && "errorType" in error) {
		return {
			message: String((error as any).message || error),
			errorType: String((error as any).errorType || "Unknown"),
		};
	}

	if (error instanceof Error) {
		return { message: error.message, errorType: error.constructor.name };
	}

	return { message: String(error), errorType: "Unknown" };
}
