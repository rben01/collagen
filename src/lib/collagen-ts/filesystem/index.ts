/**
 * File system abstraction for browser environments
 *
 * This module provides abstractions for working with browser File objects,
 * path resolution, and resource fetching in a way that's compatible with
 * the Rust implementation's filesystem concepts.
 */

import {
	MissingFileError,
	FileReadError,
	MissingManifestError,
	JsonError,
} from "../errors/index.js";
import { JsonObject } from "../jsonnet/index.js";

// =============================================================================
// Types
// =============================================================================

/** Manifest format types */
export type ManifestFormat = "json" | "jsonnet";

/** File content representation */
export interface FileContent {
	bytes: Uint8Array;
	path: string;
}

/** In-memory file system interface */
export interface InMemoryFileSystem {
	/** Get file content by path */
	load(path: string): Promise<FileContent>;

	/** Get file content synchronously (for pre-loaded filesystems) */
	loadSync(path: string): FileContent;

	/** Check if a file exists */
	exists(path: string): boolean;

	/** List all available paths */
	getPaths(): string[];

	/** Get total size of all files */
	getTotalSize(): number;

	/** Get number of files */
	getFileCount(): number;
}

// =============================================================================
// Path Utilities
// =============================================================================

/**
 * Join and normalize multiple path segments into a single path
 *
 * This function takes multiple path segments and combines them into a single
 * normalized path using stack-based processing to handle directory navigation.
 *
 * @param paths - Variable number of path segments to join
 * @returns A normalized path string with forward slashes as separators
 *
 * @example
 * ```typescript
 * // Basic path joining
 * normalizedPathJoin("path", "to", "file") // "path/to/file"
 * normalizedPathJoin("base", "sub", "file.txt") // "base/sub/file.txt"
 *
 * // Handles mixed separators
 * normalizedPathJoin("path\\with\\backslashes", "file/with/forward")
 * // "path/with/backslashes/file/with/forward"
 *
 * // Processes parent directory references (..)
 * normalizedPathJoin("base", "sub", "..", "file") // "base/file"
 * normalizedPathJoin("a", "b", "c", "..", "..", "d") // "a/d"
 *
 * // Discards current directory references (.)
 * normalizedPathJoin(".", "path", ".", "././file") // "path/file"
 *
 * // Handles strings consisting of multiple components
 * normalizedPathJoin("path/./to/./sub", "../file") // "path/to/file"
 *
 * // Handles empty paths
 * normalizedPathJoin("", "file", "") // "file"
 * normalizedPathJoin() // ""
 *
 * // Going past root results in empty components being discarded
 * normalizedPathJoin("..", "file") // "file"
 *
 * // The "empty" path becomes the root folder
 * normalizedPathJoin("base", "../../..") // "/"
 * ```
 */
export function normalizedPathJoin(...paths: string[]): string {
	const components: string[] = [];
	const componentRe = /[^/\\]+/g;

	for (const path of paths) {
		// Skip empty paths
		if (!path) {
			continue;
		}

		const componentMatches = path.matchAll(componentRe);

		for (const match of componentMatches) {
			const component = match[0];

			if (component === "" || component === ".") {
				// Skip empty components and current directory references
				continue;
			} else if (component === "..") {
				// no-op if stack is empty
				components.pop();
			} else {
				components.push(component);
			}
		}
	}

	if (components.length === 0) {
		return "/";
	}

	// Join components back together
	return components.join("/");
}

// =============================================================================
// File Reading Utilities
// =============================================================================

/** Read a File object as text */
export async function readFileAsText(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(new Error("Failed to read file as text"));
		reader.readAsText(file);
	});
}

/** Read a File object as bytes */
export async function readFileAsBytes(file: File): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const arrayBuffer = reader.result as ArrayBuffer;
			resolve(new Uint8Array(arrayBuffer));
		};
		reader.onerror = () => reject(new Error("Failed to read file as bytes"));
		reader.readAsArrayBuffer(file);
	});
}

// =============================================================================
// In-Memory File System Implementation
// =============================================================================

/** Implementation of InMemoryFileSystem using browser File objects */
export class BrowserInMemoryFileSystem implements InMemoryFileSystem {
	private files: Record<string, FileContent>;

	private constructor(files: Record<string, FileContent>) {
		this.files = files;
	}

	static async create(
		files: Map<string, File> | Record<string, File>,
	): Promise<BrowserInMemoryFileSystem> {
		const fileContents: Record<string, FileContent> = {};

		async function processFile(path: string, file: File): Promise<void> {
			const normalizedPath = normalizedPathJoin(path);
			try {
				const bytes = await readFileAsBytes(file);
				fileContents[normalizedPath] = { bytes, path: normalizedPath };
			} catch (error) {
				throw new FileReadError(normalizedPath, String(error));
			}
		}

		if (files instanceof Map) {
			for (const [path, file] of files) {
				await processFile(path, file);
			}
		} else {
			for (const path in files) {
				await processFile(path, files[path]);
			}
		}

		return new BrowserInMemoryFileSystem(fileContents);
	}

	/** Get file content by path */
	async load(path: string): Promise<FileContent> {
		return this.loadSync(path);
	}

	/** Get file content synchronously (since files are pre-loaded) */
	loadSync(path: string): FileContent {
		const normalizedPath = normalizedPathJoin(path);

		const content = this.files[normalizedPath];
		if (!content) {
			throw new MissingFileError(normalizedPath);
		}

		return content;
	}

	/** Check if a file exists */
	exists(path: string): boolean {
		return normalizedPathJoin(path) in this.files;
	}

	/** List all available paths */
	getPaths(): string[] {
		return Object.keys(this.files).sort();
	}

	/** Get total size of all files */
	getTotalSize(): number {
		let total = 0;
		for (const content of Object.values(this.files)) {
			total += content.bytes.length;
		}
		return total;
	}

	/** Get number of files */
	getFileCount(): number {
		return Object.keys(this.files).length;
	}
}

// =============================================================================
// Manifest Detection and Loading
// =============================================================================

/** Detect available manifest format */
export function detectManifestFormat(
	fs: InMemoryFileSystem,
): ManifestFormat | null {
	// Prefer jsonnet over json (same as Rust implementation)
	if (fs.exists("collagen.jsonnet")) {
		return "jsonnet";
	}
	if (fs.exists("collagen.json")) {
		return "json";
	}
	return null;
}

/** Get manifest file path for a format */
export function getManifestPath(format: ManifestFormat): string {
	switch (format) {
		case "jsonnet":
			return "collagen.jsonnet";
		case "json":
			return "collagen.json";
	}
}

/** Load and parse manifest file */
export async function loadManifest(
	fs: InMemoryFileSystem,
	format?: ManifestFormat,
): Promise<JsonObject> {
	// Auto-detect format if not specified
	const manifestFormat = format || detectManifestFormat(fs);
	if (!manifestFormat) {
		throw new MissingManifestError();
	}

	const manifestPath = getManifestPath(manifestFormat);
	const content = await fs.load(manifestPath);

	try {
		// Convert bytes to text
		const text = new TextDecoder().decode(content.bytes);

		if (manifestFormat === "json") {
			return JSON.parse(text);
		} else {
			// Handle Jsonnet compilation
			const { compileJsonnetFromFile } = await import("../jsonnet/index.js");
			return await compileJsonnetFromFile(fs, manifestPath);
		}
	} catch (error) {
		if (error instanceof SyntaxError) {
			throw new JsonError(manifestPath, error.message);
		}
		throw error;
	}
}

// =============================================================================
// Resource Resolution
// =============================================================================

/** Resolve a resource path relative to a base path */
export function resolveResourcePath(
	basePath: string,
	resourcePath: string,
): string {
	return normalizedPathJoin(basePath, resourcePath);
}

/** Fetch a resource file from the filesystem */
export async function fetchResource(
	fs: InMemoryFileSystem,
	resourcePath: string,
): Promise<FileContent> {
	const resolvedPath = normalizedPathJoin(resourcePath);
	return await fs.load(resolvedPath);
}

// =============================================================================
// Utility Functions
// =============================================================================

/** Create a file system from a Map of files */
export async function createFileSystem(
	files: Map<string, File> | Record<string, File>,
): Promise<InMemoryFileSystem> {
	return await BrowserInMemoryFileSystem.create(files);
}

/** Check if a path looks like an image file */
export function isImagePath(path: string): boolean {
	const ext = getFileExtension(path).toLowerCase();
	return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext);
}

/** Check if a path looks like a font file */
export function isFontPath(path: string): boolean {
	const ext = getFileExtension(path).toLowerCase();
	return ["woff", "woff2", "ttf", "otf"].includes(ext);
}

/** Get file extension from path */
export function getFileExtension(path: string): string {
	const lastDot = path.lastIndexOf(".");
	const lastSlash = path.lastIndexOf("/");

	if (lastDot === -1 || lastDot < lastSlash) {
		return "";
	}

	return path.slice(lastDot + 1);
}

/** Infer MIME type from file extension */
export function getMimeType(path: string): string {
	const ext = getFileExtension(path).toLowerCase();

	switch (ext) {
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "png":
			return "image/png";
		case "gif":
			return "image/gif";
		case "webp":
			return "image/webp";
		case "bmp":
			return "image/bmp";
		case "svg":
			return "image/svg+xml";
		case "woff":
			return "font/woff";
		case "woff2":
			return "font/woff2";
		case "ttf":
			return "font/ttf";
		case "otf":
			return "font/otf";
		default:
			return "application/octet-stream";
	}
}
