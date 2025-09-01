import { test as base } from "@playwright/test";

export const test = base.extend({
	page: async ({ page }, use) => {
		await page.goto("/");
		await page.waitForLoadState("domcontentloaded");
		await page.waitForSelector("body", { timeout: 2000 });
		await use(page);
	},
});
