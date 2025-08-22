/**
 * Main API for Collagen TypeScript implementation
 *
 * This module provides the main entry point for the TypeScript version of Collagen,
 * designed to be a drop-in replacement for the WASM implementation.
 */

import type { InMemoryFileSystem, ManifestFormat } from "./filesystem/index.js";
import {
	createFileSystem,
	loadManifest,
	detectManifestFormat,
} from "./filesystem/index.js";
import { validateDocument } from "./validation/index.js";
import { generateSvg } from "./svg/index.js";
import type { RootTag } from "./types/index.js";

// =============================================================================
// Main API Functions
// =============================================================================

/**
 * Generate SVG from files, similar to the WASM generateSvg function
 */
export async function generateSvgFromFiles(
	files: Map<string, File> | Record<string, File>,
	format?: ManifestFormat,
): Promise<string> {
	// Create filesystem
	const filesystem = await createFileSystem(files);

	// Load and parse manifest
	const manifestData = await loadManifest(filesystem, format);

	// Validate to create typed structure
	const rootTag = validateDocument(manifestData);

	// Generate SVG
	return await generateSvg(rootTag, filesystem);
}

/**
 * Generate SVG from a pre-created filesystem
 */
export async function generateSvgFromFileSystem(
	filesystem: InMemoryFileSystem,
	format?: ManifestFormat,
): Promise<string> {
	// Load and parse manifest
	const manifestData = await loadManifest(filesystem, format);

	// Validate to create typed structure
	const rootTag = validateDocument(manifestData);

	// Generate SVG
	return await generateSvg(rootTag, filesystem);
}

/**
 * Parse and validate a manifest without generating SVG
 */
export async function parseManifest(
	filesystem: InMemoryFileSystem,
	format?: ManifestFormat,
): Promise<RootTag> {
	const manifestData = await loadManifest(filesystem, format);
	return validateDocument(manifestData);
}

/**
 * Check what manifest formats are available in a filesystem
 */
export function getSupportedFormats(): ManifestFormat[] {
	// Both JSON and Jsonnet are now supported
	return ["json", "jsonnet"];
}

/**
 * Detect what manifest format is available in a filesystem
 */
export function getAvailableManifestFormat(
	filesystem: InMemoryFileSystem,
): ManifestFormat | null {
	return detectManifestFormat(filesystem);
}

/**
 * Get information about a filesystem
 */
export function getFileSystemInfo(filesystem: InMemoryFileSystem) {
	return {
		fileCount: filesystem.getFileCount(),
		totalSize: filesystem.getTotalSize(),
		paths: filesystem.getPaths(),
		manifestFormat: detectManifestFormat(filesystem),
	};
}

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

export type { InMemoryFileSystem, FileContent } from "./filesystem/index.js";

// Export filesystem utilities
export {
	createFileSystem,
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
export {
	base64Encode,
	base64Decode,
	escapeXml,
	isPlainObject,
	ensureArray,
} from "./utils/index.js";

// Export errors
export * from "./errors/index.js";

// Export Jsonnet utilities
export { compileJsonnet, compileJsonnetFromFile } from "./jsonnet/index.js";
export type { JsonnetConfig } from "./jsonnet/sjsonnet.js";

// =============================================================================
// Compatibility Layer
// =============================================================================

/**
 * Error type compatible with WASM CollagenError
 */
export interface CollagenCompatError {
	message: string;
	errorType: string;
}

/**
 * Convert our errors to WASM-compatible format
 */
export function toCompatibleError(error: unknown): CollagenCompatError {
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
