/**
 * Jsonnet integration for Collagen TypeScript implementation
 *
 * This module provides integration with sjsonnet.js to compile Jsonnet
 * files to JavaScript objects for use in the Collagen pipeline.
 */

import type { InMemoryFileSystem } from "../filesystem/index.js";
import { normalizedPathJoin } from "../filesystem/index.js";
import { JsonnetError } from "../errors/index.js";
import {
	SjsonnetMain,
	JsonnetResolverCallback,
	JsonnetLoaderCallback,
	JsonnetConfig,
} from "./sjsonnet.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonObject =
	| JsonPrimitive
	| JsonPrimitive[]
	| Record<string, JsonPrimitive>;

// =============================================================================
// Jsonnet Compilation
// =============================================================================

/**
 * Compile Jsonnet code to a JavaScript object
 */
export function compileJsonnet(
	jsonnetCode: string,
	filesystem: InMemoryFileSystem,
	config: JsonnetConfig = {},
	manifestPath: string = "collagen.jsonnet",
): JsonObject {
	try {
		// Create resolver callback (for resolving import paths)
		const resolverCallback: JsonnetResolverCallback = (wd, imported) =>
			normalizedPathJoin(wd, imported);

		// Create loader callback (for loading file contents)
		const loaderCallback: JsonnetLoaderCallback = (path, _) => {
			try {
				return new TextDecoder().decode(filesystem.loadSync(path).bytes);
			} catch (error) {
				// If the file doesn't exist, throw a more descriptive error
				throw new Error(`Failed to load Jsonnet import: ${path}`);
			}
		};
		// Compile the Jsonnet code with correct argument order
		const result = SjsonnetMain.interpret(
			jsonnetCode,
			{},
			config.tlaVars ?? {},
			config.cwd ?? "",
			resolverCallback,
			loaderCallback,
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
): Promise<JsonObject> {
	try {
		// Load the Jsonnet file
		const fileContent = await filesystem.load(manifestPath);
		const jsonnetCode = new TextDecoder().decode(fileContent.bytes);

		// Compile it
		return compileJsonnet(
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
