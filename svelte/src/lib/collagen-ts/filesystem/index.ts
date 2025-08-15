/**
 * File system abstraction for browser environments
 *
 * This module provides abstractions for working with browser File objects,
 * path resolution, and resource fetching in a way that's compatible with
 * the Rust implementation's filesystem concepts.
 */

import {
	InvalidPathError,
	MissingFileError,
	FileReadError,
	MissingManifestError,
	JsonError,
	JsonnetError,
} from "../errors/index.js";

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

/** Normalize a path for consistent handling */
export function normalizePath(path: string): string {
	// Remove leading slash and normalize separators
	let normalized = path.replace(/^\/+/, "");

	// Convert backslashes to forward slashes
	normalized = normalized.replace(/\\/g, "/");

	// Remove duplicate slashes
	normalized = normalized.replace(/\/+/g, "/");

	// Remove trailing slash unless it's the root
	if (normalized.length > 1 && normalized.endsWith("/")) {
		normalized = normalized.slice(0, -1);
	}

	return normalized;
}

/** Canonicalize a path using string operations (similar to Rust implementation) */
export function canonicalizePath(
	basePath: string,
	relativePath: string,
): string {
	// Paths cannot start with /
	if (relativePath.startsWith("/")) {
		throw new InvalidPathError(relativePath);
	}

	const components: string[] = [];

	// Start with base path components (if any)
	if (basePath && basePath !== "/") {
		for (const component of basePath.split("/").filter(c => c.length > 0)) {
			components.push(component);
		}
	}

	// Process relative path components
	for (const component of relativePath.split("/").filter(c => c.length > 0)) {
		if (component === ".") {
			// Current directory - skip
			continue;
		} else if (component === "..") {
			// Parent directory - pop if possible
			if (components.length > 0) {
				components.pop();
			}
		} else {
			// Regular component
			components.push(component);
		}
	}

	// Build final path
	if (components.length === 0) {
		return "";
	}

	return components.join("/");
}

/** Join two paths */
export function joinPath(basePath: string, relativePath: string): string {
	if (!relativePath) {
		return normalizePath(basePath);
	}

	const base = normalizePath(basePath);
	const rel = normalizePath(relativePath);

	if (!base || base === "/") {
		return rel;
	}

	return `${base}/${rel}`;
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
	private files: Map<string, File>;
	private cache: Map<string, FileContent> = new Map();

	constructor(files: Map<string, File> | Record<string, File>) {
		if (files instanceof Map) {
			this.files = new Map();
			for (const [path, file] of files) {
				this.files.set(normalizePath(path), file);
			}
		} else {
			this.files = new Map();
			for (const [path, file] of Object.entries(files)) {
				this.files.set(normalizePath(path), file);
			}
		}
	}

	/** Get file content by path */
	async load(path: string): Promise<FileContent> {
		const normalizedPath = normalizePath(path);

		// Check cache first
		if (this.cache.has(normalizedPath)) {
			return this.cache.get(normalizedPath)!;
		}

		// Get file from map
		const file = this.files.get(normalizedPath);
		if (!file) {
			throw new MissingFileError(normalizedPath);
		}

		try {
			const bytes = await readFileAsBytes(file);
			const content: FileContent = { bytes, path: normalizedPath };

			// Cache the result
			this.cache.set(normalizedPath, content);
			return content;
		} catch (error) {
			throw new FileReadError(normalizedPath, String(error));
		}
	}

	/** Check if a file exists */
	exists(path: string): boolean {
		return this.files.has(normalizePath(path));
	}

	/** List all available paths */
	getPaths(): string[] {
		return Array.from(this.files.keys()).sort();
	}

	/** Get total size of all files */
	getTotalSize(): number {
		let total = 0;
		for (const file of this.files.values()) {
			total += file.size;
		}
		return total;
	}

	/** Get number of files */
	getFileCount(): number {
		return this.files.size;
	}

	/** Clear the cache (useful for memory management) */
	clearCache(): void {
		this.cache.clear();
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
): Promise<unknown> {
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
			throw new JsonnetError(
				manifestPath,
				"Jsonnet compilation not yet implemented in TypeScript",
			);
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
	return canonicalizePath(basePath, resourcePath);
}

/** Fetch a resource file from the filesystem */
export async function fetchResource(
	fs: InMemoryFileSystem,
	resourcePath: string,
): Promise<FileContent> {
	const resolvedPath = normalizePath(resourcePath);
	return await fs.load(resolvedPath);
}

// =============================================================================
// Utility Functions
// =============================================================================

/** Create a file system from a Map of files */
export function createFileSystem(
	files: Map<string, File> | Record<string, File>,
): InMemoryFileSystem {
	return new BrowserInMemoryFileSystem(files);
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
