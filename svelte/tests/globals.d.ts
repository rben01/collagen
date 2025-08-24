/**
 * Global type declarations for e2e tests
 *
 * This file provides TypeScript declarations for custom window properties
 * and other globals used in Playwright e2e tests.
 */

declare global {
	interface Window {
		// Test-specific properties
		testFiles?: Record<string, File>;
		uploadCallbackTriggered?: boolean;
		uploadedFileCount?: number;
		handleFilesUploaded?: (files: any) => void;
		mockUploadedFiles?: Record<string, { size: number }>;
		mockLargeFiles?: Record<string, { size: number }>;
		uploadedFiles?: Record<string, { size: number }>;

		// SVG Display test properties
		downloadTriggered?: boolean;
		downloadHref?: string;
		downloadFilename?: string;

		// Workflow test properties
		mockProjectFiles?: Record<string, File>;

		// Application-specific properties
		sjsonnet?: any;
	}

	// Extend Element to include style property for DOM manipulation in tests
	interface Element {
		style: CSSStyleDeclaration;
	}
}

// This export is needed to make this file a module
export {};
