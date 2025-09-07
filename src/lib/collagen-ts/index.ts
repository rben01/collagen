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

export function toCollagenError(error: unknown): CollagenError {
	if (error instanceof Error) {
		return { message: error.message, errorType: error.constructor.name };
	}

	const typedError = error as Partial<CollagenError>;

	if (typedError && typeof typedError === "object") {
		return {
			message: String(typedError.message || typedError),
			errorType: String(typedError.errorType || "Unknown"),
		};
	}

	return { message: String(error), errorType: "Unknown" };
}
