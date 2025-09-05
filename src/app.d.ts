// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	// Extend the Window interface with custom properties used in tests
	interface Window {
		/**
		 * Set to true when the FileUploader component has been mounted.
		 * Used by Playwright E2E tests to ensure the component is ready before
		 * interacting with it.
		 */
		fileUploaderMounted?: boolean;
	}
}

export {};
