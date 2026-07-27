/**
 * Global type declarations for e2e tests
 *
 * This file provides TypeScript declarations for custom window properties
 * and other globals used in Playwright e2e tests.
 */

declare global {
	interface Window {
		/**
		 * Staged `webkitRelativePath` values, keyed by `File.name`, used by the
		 * file-picker upload helper. See `stageRelativePaths` in `e2e/upload.ts`
		 * for why this shim is necessary.
		 */
		__e2eRelPaths?: Record<string, string>;
		/** Guards against installing the `webkitRelativePath` shim twice. */
		__e2eRelPathsPatched?: boolean;
	}
}

// This export is needed to make this file a module
export {};
