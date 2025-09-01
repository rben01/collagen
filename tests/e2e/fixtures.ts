import { test as base } from "@playwright/test";

export const test = base.extend({
	page: async ({ page }, use) => {
		await page.goto("/");

		await page.waitForLoadState();
		await page
			.locator(".drop-zone")
			.waitFor({ state: "visible", timeout: 5000 });

		// page needs to settle, event handlers need to be registered, so wait for
		// FileUploader to be mounted
		await page.waitForFunction(() => window.fileUploaderMounted, undefined, {
			timeout: 5000,
		});

		await use(page);
	},
});
