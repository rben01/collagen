import { test as base } from "@playwright/test";

export const test = base.extend({
	page: async ({ page }, use) => {
		// ... login and navigation logic
		await page.goto("/");
		await page.waitForLoadState("domcontentloaded");

		// Wait for the main app to mount instead of networkidle due to large sjsonnet.js loading
		await page.waitForSelector("#app", { timeout: 2000 });

		await use(page);
	},
});
