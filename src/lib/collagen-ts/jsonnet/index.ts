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
} from "./sjsonnet.js";

// technically not true (JSON cannot be `undefined`) but close enough to true to be
// useful, since the stuff we're deserializing from JSON can be missing keys which, in
// JS-land, is `undefined`
export type JsonPrimitive = string | number | boolean | null | undefined;
export type JsonObject =
	| JsonPrimitive
	| JsonObject[]
	| { [key: string]: JsonObject };

/**
 * Compile Jsonnet code to a JavaScript object
 */
export function compileJsonnet(
	jsonnetCode: string,
	filesystem: InMemoryFileSystem,
	manifestPath: string = "collagen.jsonnet",
): JsonObject {
	try {
		// Create resolver callback (for resolving import paths)
		const resolverCallback: JsonnetResolverCallback = (wd, imported) =>
			normalizedPathJoin(wd, imported);

		// Create loader callback (for loading file contents)
		const loaderCallback: JsonnetLoaderCallback = (path, _) => {
			try {
				return new TextDecoder().decode(filesystem.load(path).bytes);
			} catch (error) {
				// If the file doesn't exist, throw a more descriptive error
				throw new Error(`Failed to load Jsonnet import: ${path}`);
			}
		};
		// Compile the Jsonnet code with correct argument order
		const result = SjsonnetMain.interpret(
			jsonnetCode,
			{},
			{},
			"",
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
