/**
 * File system abstraction for browser environments
 *
 * This module provides abstractions for working with browser File objects,
 * path resolution, and resource fetching.
 */

import {
	MissingFileError,
	FileReadError,
	MissingManifestError,
	JsonError,
} from "../errors/index.js";
import { base64Encode, generateSvg } from "../index.js";
import {
	analyzeJson,
	analyzeJsonnet,
	type ProvenanceResult,
} from "../manifest/provenance.js";
import { compileJsonnet, type JsonObject } from "../jsonnet/index.js";
import { validateDocument } from "../validation/index.js";

// =============================================================================
// Types
// =============================================================================

/** Manifest format types */
export type ManifestFormat = "json" | "jsonnet";

/** File content representation */
export interface FileContent {
	bytes: Uint8Array<ArrayBuffer>;
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
export async function readFileAsBytes(
	file: File,
): Promise<Uint8Array<ArrayBuffer>> {
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

	static createEmpty(): InMemoryFileSystem {
		return new InMemoryFileSystem(new Map());
	}

	static async create(
		files: Map<string, File>,
		normalizePaths = true,
	): Promise<InMemoryFileSystem> {
		const fs = InMemoryFileSystem.createEmpty();
		await Promise.all(
			files
				.entries()
				.map(([path, file]) => fs.addFile(path, file, normalizePaths)),
		);
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

	addFileContents(
		path: string,
		byteContents: Uint8Array<ArrayBuffer>,
		normalizePath = true,
	) {
		if (normalizePath) {
			path = normalizedPathJoin(path);
		}
		this.#files.set(path, { bytes: byteContents, path });
	}

	/** Merge new files into existing filesystem */
	async mergeFiles(
		files: Iterable<[string, File]>,
		normalizePaths = true,
	): Promise<void> {
		for (const [path, file] of files) {
			await this.addFile(path, file, normalizePaths);
		}
	}

	/** Remove a file and return the removed File object if it existed */
	removeFile(path: string, normalizePath = true): FileContent | undefined {
		if (normalizePath) {
			path = normalizedPathJoin(path);
		}

		const fileContent = this.#files.get(path);
		if (fileContent) {
			this.#files.delete(path);
			return fileContent;
		}
		return undefined;
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

	/**
	 * Find the manifest in `dir` (the filesystem root by default).
	 *
	 * `dir` is how nested skeletons are read: rather than re-rooting a copy of
	 * the filesystem at the container, we keep one filesystem and point at the
	 * container's directory, so imports that reach above it still resolve.
	 */
	loadManifestContents(dir: string = ""): {
		format: ManifestFormat;
		content: FileContent;
	} {
		let content;
		if ((content = this.get(getManifestPath("jsonnet", dir), false))) {
			return { format: "jsonnet", content };
		}
		if ((content = this.get(getManifestPath("json", dir), false))) {
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
	async generateUntypedObject(dir: string = "") {
		const { format: manifestFormat, content } =
			this.loadManifestContents(dir);
		const manifestPath = getManifestPath(manifestFormat, dir);

		try {
			// Convert bytes to text
			const text = new TextDecoder().decode(content.bytes);

			if (manifestFormat === "json") {
				return JSON.parse(text) as JsonObject;
			} else {
				return await compileJsonnet(text, this, manifestPath);
			}
		} catch (error) {
			if (error instanceof SyntaxError) {
				throw new JsonError(manifestPath, error.message);
			}
			throw error;
		}
	}

	async generateRootTag(dir: string = "") {
		const { format: manifestFormat, content: _ } =
			this.loadManifestContents(dir);

		try {
			return validateDocument(await this.generateUntypedObject(dir));
		} catch (error) {
			if (error instanceof SyntaxError) {
				throw new JsonError(
					getManifestPath(manifestFormat, dir),
					error.message,
				);
			}
			throw error;
		}
	}

	async generateSvg(options: { annotate?: boolean } = {}) {
		return generateSvg(await this.generateRootTag(), this, options);
	}

	/**
	 * Locate every element of the manifest in its source text, for the visual
	 * editor.
	 *
	 * Returns the evaluated manifest either way. When analysis fails the result
	 * carries a reason, and the editor renders and selects but refuses to write
	 * back rather than guessing at an edit.
	 */
	async analyzeManifest(dir: string = ""): Promise<ProvenanceResult> {
		const { format, content } = this.loadManifestContents(dir);
		const source = new TextDecoder().decode(content.bytes);
		const manifestPath = getManifestPath(format, dir);

		return format === "json"
			? analyzeJson(source)
			: analyzeJsonnet(source, this, manifestPath);
	}

	toJsonB64() {
		const files: Record<string, string> = {};
		for (const [path, contents] of this.files) {
			files[path] = base64Encode(contents.bytes);
		}
		return JSON.stringify({ files });
	}
}

// =============================================================================
// Manifest Detection and Loading
// =============================================================================

/** Get manifest file path for a format, optionally within a directory */
export function getManifestPath(
	format: ManifestFormat,
	dir: string = "",
): string {
	const name = format === "jsonnet" ? "collagen.jsonnet" : "collagen.json";
	return dir ? normalizedPathJoin(dir, name) : name;
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
		// Images
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
		// Fonts
		case "woff":
			return "font/woff";
		case "woff2":
			return "font/woff2";
		case "ttf":
			return "font/ttf";
		case "otf":
			return "font/otf";
		// Common text formats
		case "txt":
			return "text/plain";
		case "md":
			return "text/markdown";
		case "csv":
			return "text/csv";
		case "html":
			return "text/html";
		case "css":
			return "text/css";
		case "js":
			return "application/javascript";
		case "ts":
			return "application/typescript";
		case "xml":
			return "application/xml";
		case "yaml":
		case "yml":
			return "application/yaml";
		case "json":
			return "application/json";
		case "jsonnet":
			// Not a registered MIME; use a descriptive type
			return "application/jsonnet";
		default:
			return "application/octet-stream";
	}
}

/** Determine if a given path should be treated as a text file */
export function isTextPath(path: string): boolean {
	const mime = getMimeType(path);
	if (mime.startsWith("text/")) return true;
	switch (mime) {
		case "application/json":
		case "application/jsonnet":
		case "application/xml":
		case "application/yaml":
		case "application/javascript":
		case "application/typescript":
			return true;
		default:
			return false;
	}
}
