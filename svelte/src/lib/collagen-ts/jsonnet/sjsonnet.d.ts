/**
 * TypeScript type definitions for sjsonnet.js
 *
 * This module provides type definitions for the sjsonnet JavaScript API,
 * which is compiled from Scala.js.
 */

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
		 * @param jpaths - Array of library paths
		 * @param importCallback - Function to resolve imports
		 * @returns JavaScript object (not JSON string)
		 */
		interpret(
			jsonnetCode: string,
			extVars: Record<string, unknown>,
			tlaVars: Record<string, unknown>,
			jpaths: string,
			importCallback: JsonnetImportCallback | null,
		): unknown;
	};
}

/** sjsonnet import callback function */
export type JsonnetImportCallback = (
	dir: string,
	importedFrom: string,
) => { foundHere: string; content: string } | null;

// =============================================================================
// Jsonnet Processing Types
// =============================================================================

/** Configuration for Jsonnet compilation */
export interface JsonnetConfig {
	/** External variables to pass to Jsonnet */
	extVars?: Record<string, unknown>;

	/** Top-level arguments to pass to Jsonnet */
	tlaVars?: Record<string, unknown>;

	/** Library search paths */
	jpaths?: string[];
}

/** Result of Jsonnet compilation */
export interface JsonnetResult {
	/** Whether compilation was successful */
	success: boolean;

	/** Compiled JavaScript object (if successful) */
	result?: unknown;

	/** Error message (if failed) */
	error?: string;
}
