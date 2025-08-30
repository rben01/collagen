/**
 * Global type declarations for e2e tests
 *
 * This file provides TypeScript declarations for custom window properties
 * and other globals used in Playwright e2e tests.
 */

export type ProjectFiles = Record<string, string>;
export type SampleProjects = Record<string, ProjectFiles>;

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

		generatedSvg?: string;

		// Application-specific properties
		sjsonnet?: any;

		// FileUploader test properties
		getMimeType: (path: string) => Promise<string>;
		exposeFileUploader?: (component: any) => void;
		__fileUploader?: {
			processFilesFromFileList?: (fileList: FileList) => Promise<void>;
			processFilesFromDataTransfer?: (
				items: DataTransferItemList,
			) => Promise<void>;
		};
	}

	// Extend Element to include style property for DOM manipulation in tests
	interface Element {
		style: CSSStyleDeclaration;
	}
}

// This export is needed to make this file a module
export {};
