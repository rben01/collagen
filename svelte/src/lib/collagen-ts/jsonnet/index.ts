/**
 * Jsonnet integration for Collagen TypeScript implementation
 *
 * This module provides integration with sjsonnet.js to compile Jsonnet
 * files to JavaScript objects for use in the Collagen pipeline.
 */

import type { InMemoryFileSystem } from "../filesystem/index.js";
import { normalizePath, canonicalizePath } from "../filesystem/index.js";
import { JsonnetError } from "../errors/index.js";
import type {
	SjsonnetMain,
	JsonnetImportCallback,
	JsonnetConfig,
} from "./types.js";

// =============================================================================
// sjsonnet.js Loading
// =============================================================================

let sjsonnetPromise: Promise<SjsonnetMain> | null = null;

/** Load sjsonnet.js dynamically */
export async function loadSjsonnet(): Promise<SjsonnetMain> {
	if (sjsonnetPromise) {
		return sjsonnetPromise;
	}

	sjsonnetPromise = (async () => {
		// Check if already loaded globally
		if (window.SjsonnetMain) {
			return window.SjsonnetMain;
		}

		if (typeof window.exports === "undefined") {
			window.exports = {};
		}

		// Load the script dynamically
		return new Promise<SjsonnetMain>((resolve, reject) => {
			const script = document.createElement("script");
			script.src = "/sjsonnet.js";
			script.addEventListener("load", () => {
				const sjsonnetMain = window.exports?.SjsonnetMain;
				if (sjsonnetMain) {
					window.SjsonnetMain = sjsonnetMain;
					resolve(sjsonnetMain);
				} else {
					reject(new Error("SjsonnetMain not found after loading script"));
				}
			});
			script.addEventListener("error", () => {
				reject(new Error("Failed to load sjsonnet.js"));
			});
			document.head.appendChild(script);
		});
	})();

	return sjsonnetPromise;
}

// =============================================================================
// Import Resolution
// =============================================================================

/** Pre-load all files as text for synchronous access */
async function preloadFileCache(
	filesystem: InMemoryFileSystem,
): Promise<Map<string, string>> {
	const cache = new Map<string, string>();
	const paths = filesystem.getPaths();

	// Load all text files (Jsonnet files and potential imports)
	await Promise.all(
		paths
			.filter(
				path => path.endsWith(".jsonnet") || path.endsWith(".libsonnet"),
			)
			.map(async path => {
				try {
					const content = await filesystem.load(path);
					const text = new TextDecoder().decode(content.bytes);
					cache.set(path, text);
				} catch (error) {
					console.warn(`Failed to preload file ${path}:`, error);
				}
			}),
	);

	return cache;
}

/** Create an import callback using preloaded file cache */
function createImportCallback(
	fileCache: Map<string, string>,
): JsonnetImportCallback {
	return (dir: string, importedFrom: string) => {
		try {
			// Resolve the import path relative to the current directory
			const importPath = canonicalizePath(dir, importedFrom);
			const resolvedPath = normalizePath(importPath);

			// Check the cache for the file
			if (fileCache.has(resolvedPath)) {
				return {
					foundHere: resolvedPath,
					content: fileCache.get(resolvedPath)!,
				};
			}

			// Try with .jsonnet extension if not already present
			const withExtension = resolvedPath.endsWith(".jsonnet")
				? resolvedPath
				: resolvedPath + ".jsonnet";

			if (fileCache.has(withExtension)) {
				return {
					foundHere: withExtension,
					content: fileCache.get(withExtension)!,
				};
			}

			// Try with .libsonnet extension
			const withLibExtension = resolvedPath.endsWith(".libsonnet")
				? resolvedPath
				: resolvedPath.replace(/\.jsonnet$/, ".libsonnet");

			if (fileCache.has(withLibExtension)) {
				return {
					foundHere: withLibExtension,
					content: fileCache.get(withLibExtension)!,
				};
			}

			return null; // File not found
		} catch (error) {
			console.warn(
				`Failed to resolve import: ${importedFrom} from ${dir}:`,
				error,
			);
			return null;
		}
	};
}

// =============================================================================
// Jsonnet Compilation
// =============================================================================

/**
 * Compile Jsonnet code to a JavaScript object
 */
export async function compileJsonnet(
	jsonnetCode: string,
	filesystem: InMemoryFileSystem,
	config: JsonnetConfig = {},
	manifestPath: string = "collagen.jsonnet",
): Promise<unknown> {
	try {
		const [sjsonnet, fileCache] = await Promise.all([
			loadSjsonnet(),
			preloadFileCache(filesystem),
		]);

		// Create import callback
		const importCallback = createImportCallback(fileCache);

		// Set up compilation parameters
		const extVars = config.extVars || {};
		const tlaVars = config.tlaVars || {};
		const jpaths = (config.jpaths || []).join(":");

		// Compile the Jsonnet code
		const result = sjsonnet.interpret(
			jsonnetCode,
			extVars,
			tlaVars,
			jpaths,
			importCallback,
		);

		return result;
	} catch (error) {
		throw new JsonnetError(
			manifestPath,
			error instanceof Error ? error.message : String(error),
		);
	}
}

/**
 * Compile Jsonnet from filesystem
 */
export async function compileJsonnetFromFile(
	filesystem: InMemoryFileSystem,
	manifestPath: string,
	config: JsonnetConfig = {},
): Promise<unknown> {
	try {
		// Load the Jsonnet file
		const fileContent = await filesystem.load(manifestPath);
		const jsonnetCode = new TextDecoder().decode(fileContent.bytes);

		// Compile it
		return await compileJsonnet(
			jsonnetCode,
			filesystem,
			config,
			manifestPath,
		);
	} catch (error) {
		if (error instanceof JsonnetError) {
			throw error;
		}

		throw new JsonnetError(
			manifestPath,
			error instanceof Error ? error.message : String(error),
		);
	}
}

// =============================================================================
// Utility Functions
// =============================================================================

/** Check if sjsonnet.js is available */
export async function isSjsonnetAvailable(): Promise<boolean> {
	try {
		await loadSjsonnet();
		return true;
	} catch {
		return false;
	}
}

/** Get version information about sjsonnet */
export async function getSjsonnetInfo(): Promise<Record<string, unknown>> {
	try {
		await loadSjsonnet();
		return {
			available: true,
			version: "unknown", // sjsonnet doesn't expose version info
			source: "sjsonnet.js",
		};
	} catch (error) {
		return {
			available: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
