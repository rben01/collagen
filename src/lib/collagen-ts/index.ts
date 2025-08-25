/**
 * Main API for Collagen TypeScript implementation
 *
 * This module provides the main entry point for the TypeScript version of Collagen,
 * designed to be a drop-in replacement for the WASM implementation.
 */

import { InMemoryFileSystem, ManifestFormat } from "./filesystem/index";
import { generateSvg } from "./svg/index";

// =============================================================================
// Main API Functions
// =============================================================================

/**
 * Generate SVG from files.
 */
export async function generateSvgFromFiles(
  files: Map<string, File>,
): Promise<string> {
  return await generateSvgFromFileSystem(
    await InMemoryFileSystem.create(files),
  );
}

/**
 * Generate SVG from a pre-created filesystem.
 */
export async function generateSvgFromFileSystem(
  fs: InMemoryFileSystem,
): Promise<string> {
  const rootTag = await fs.parseManifestIntoRootTag();
  return await generateSvg(rootTag, fs);
}

/**
 * Check what manifest formats are available in a filesystem
 */
export function getSupportedFormats(): ManifestFormat[] {
  return ["json", "jsonnet"];
}

/**
 * Get information about a filesystem
 */
export function getFileSystemInfo(fs: InMemoryFileSystem) {
  return {
    fileCount: fs.getFileCount(),
    totalSize: fs.getTotalSize(),
    paths: fs.getPaths(),
    manifestFormat: fs.loadManifestContents().format,
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

export { InMemoryFileSystem, FileContent } from "./filesystem/index.js";

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
export { compileJsonnet } from "./jsonnet/index.js";
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
