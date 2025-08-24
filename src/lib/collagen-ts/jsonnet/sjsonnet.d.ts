/**
 * TypeScript type definitions for sjsonnet.js
 *
 * This module provides type definitions for the sjsonnet JavaScript API,
 * which is compiled from Scala.js.
 */

import { JsonObject } from ".";

// =============================================================================
// sjsonnet Global Interface
// =============================================================================

declare module "./sjsonnet.js" {
	export const SjsonnetMain: {
		/**
		 * Interpret Jsonnet code and return a JavaScript object
		 *
		 * @param jsonnetCode - The Jsonnet source code
		 * @param extVars - External variables object
		 * @param tlaVars - Top-level arguments object
		 * @param cwd - Initial working directory
		 * @param importCallback - Function to resolve imports
		 * @returns JavaScript object (not JSON string)
		 */
		interpret(
			jsonnetCode: string,
			extVars: Record<string, unknown>,
			tlaVars: Record<string, string>,
			cwd: string,
			resolverCallback: JsonnetResolverCallback,
			loaderCallback: JsonnetLoaderCallback,
		): JsonObject;
	};
}

/** Configuration for Jsonnet compilation */
export interface JsonnetConfig {
	// We are intentionally omitting extVars because we don't need them and it doesn't
	// look like Sjsonnet correctly supports them

	/** Top-level arguments to pass to Jsonnet */
	tlaVars?: Record<string, string>;

	/** Library search paths */
	cwd?: string;
}

export type JsonnetResolverCallback = (wd: string, imported: string) => string;

export type JsonnetLoaderCallback = (path: string, _binary: unknown) => string;
