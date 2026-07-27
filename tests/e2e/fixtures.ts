import { test as base } from "@playwright/test";

export const test = base.extend({
	page: async ({ page }, use) => {
		await page.goto("/");

		await page.waitForLoadState();

		// The FileList region is the app's upload surface. It renders even with an
		// empty filesystem, so it is present for every test regardless of state.
		await page
			.getByRole("region", { name: "File information" })
			.waitFor({ state: "visible", timeout: 10000 });

		// The page is prerendered, so the markup above exists in the served HTML
		// before Svelte hydrates and attaches the drag/drop and click handlers.
		// Waiting on the selector alone therefore races hydration; `appMounted` is
		// set in the page's onMount and is the signal that handlers are live.
		await page.waitForFunction(() => window.appMounted === true, undefined, {
			timeout: 10000,
		});

		await use(page);
	},
});
