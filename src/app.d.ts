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
		 * Set to true once the main page has mounted and hydrated.
		 * E2E tests wait on this before interacting: the page is prerendered, so
		 * elements exist in the HTML before their event handlers are attached,
		 * and waiting on a selector alone would race hydration.
		 */
		appMounted?: boolean;
	}
}

export {};
