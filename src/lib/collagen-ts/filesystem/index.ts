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
import { generateSvg } from "../index.js";
import { type JsonObject } from "../jsonnet/index.js";
import { validateDocument } from "../validation/index.js";

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

// =============================================================================
// Path Utilities
// =============================================================================

/**
 * Join and normalize multiple path segments into a single path
 *
 * This function takes multiple path segments and combines them into a single normalized
 * path using stack-based processing to handle directory navigation. Note that the
 * resulting path _never_ starts with a leading slash, regardless of whether any input
 * values (especially the first) do. Empty paths, paths that resolve to the root, etc.
 * will all become `"."`
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
 *
 * // Going past root results in empty components being discarded
 * normalizedPathJoin("..", "file") // "file"
 *
 * // The "empty" path, or any other path resolving to root, becomes the current folder
 * normalizedPathJoin() // "."
 * normalizedPathJoin("") // "."
 * normalizedPathJoin("/") // "."
 * normalizedPathJoin("base", "../../..") // "."
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
		return ".";
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
export class InMemoryFileSystem {
	#files: Map<string, FileContent>;

	private constructor(files: Map<string, FileContent>) {
		this.#files = files;
	}

	static async create(
		files: Map<string, File>,
		normalizePaths = true,
	): Promise<InMemoryFileSystem> {
		const fs = new InMemoryFileSystem(new Map());
		for (const [path, file] of files) {
			await fs.addFile(path, file, normalizePaths);
		}
		return fs;
	}

	get files(): Map<string, FileContent> {
		return this.#files;
	}

	/** Get file content synchronously (since files are pre-loaded) */
	load(path: string, normalizePath = true): FileContent {
		if (normalizePath) {
			path = normalizedPathJoin(path);
		}

		const content = this.get(path);
		if (!content) {
			throw new MissingFileError(path);
		}

		return content;
	}

	/** Add a file */
	async addFile(path: string, file: File, normalizePath = true) {
		if (normalizePath) {
			path = normalizedPathJoin(path);
		}
		try {
			const bytes = await readFileAsBytes(file);
			const newFile = { bytes, path };
			this.#files.set(path, newFile);
			return newFile;
		} catch (error) {
			throw new FileReadError(path, String(error));
		}
	}

	/** Check if a file exists */
	has(path: string, normalizePath = true) {
		if (normalizePath) {
			path = normalizedPathJoin(path);
		}
		return this.#files.has(normalizedPathJoin(path));
	}

	get(path: string, normalizePath = true) {
		if (normalizePath) {
			path = normalizedPathJoin(path);
		}
		return this.#files.get(normalizedPathJoin(path));
	}

	/** List all available paths */
	getPaths() {
		return Array.from(this.#files.keys()).sort();
	}

	/** Get total size of all files */
	getTotalSize() {
		let total = 0;
		for (const content of this.#files.values()) {
			total += content.bytes.length;
		}
		return total;
	}

	/** Get number of files */
	getFileCount() {
		return this.#files.size;
	}

	loadManifestContents(): { format: ManifestFormat; content: FileContent } {
		let content;
		if ((content = this.get("collagen.jsonnet", false))) {
			return { format: "jsonnet", content };
		}
		if ((content = this.get("collagen.json", false))) {
			return { format: "json", content };
		}
		throw new MissingManifestError();
	}

	/**
	 * Generate an unvalidated object
	 *
	 * Primarily used for testing, so we can test object loading separately from
	 * validation.
	 */
	async generateUntypedObject() {
		const { format: manifestFormat, content } = this.loadManifestContents();

		try {
			// Convert bytes to text
			const text = new TextDecoder().decode(content.bytes);

			if (manifestFormat === "json") {
				return JSON.parse(text) as JsonObject;
			} else {
				const { compileJsonnet } = await import("../jsonnet/index.js");
				return compileJsonnet(text, this, getManifestPath(manifestFormat));
			}
		} catch (error) {
			if (error instanceof SyntaxError) {
				throw new JsonError(getManifestPath(manifestFormat), error.message);
			}
			throw error;
		}
	}

	async generateRootTag() {
		const { format: manifestFormat, content: _ } =
			this.loadManifestContents();

		try {
			return validateDocument(await this.generateUntypedObject());
		} catch (error) {
			if (error instanceof SyntaxError) {
				throw new JsonError(getManifestPath(manifestFormat), error.message);
			}
			throw error;
		}
	}

	async generateSvg() {
		return generateSvg(await this.generateRootTag(), this);
	}
}

// =============================================================================
// Manifest Detection and Loading
// =============================================================================

/** Get manifest file path for a format */
export function getManifestPath(format: ManifestFormat): string {
	switch (format) {
		case "jsonnet":
			return "collagen.jsonnet";
		case "json":
			return "collagen.json";
	}
}

// =============================================================================
// Utility Functions
// =============================================================================

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
