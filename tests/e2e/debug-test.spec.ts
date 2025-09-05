import { test, expect } from "@playwright/test";

test.describe("Debug window.fileUploaderMounted", () => {
	test.skip("should check if window.fileUploaderMounted is set", async ({
		page,
	}) => {
		// Listen to console logs and errors from the page
		page.on("console", msg => console.log("PAGE LOG:", msg.text()));
		page.on("pageerror", error => console.log("PAGE ERROR:", error.message));
		page.on("requestfailed", request =>
			console.log(
				"REQUEST FAILED:",
				request.url(),
				request.failure()?.errorText,
			),
		);

		await page.goto("http://localhost:8080");

		// Wait for page to load
		await page.waitForLoadState("networkidle");

		// Try to find the drop zone first (accessible button)
		const dropZone = page.getByRole("button", {
			name: /file upload drop zone/i,
		});
		await expect(dropZone).toBeVisible({ timeout: 10000 });

		console.log("Drop zone found, checking window.fileUploaderMounted...");

		// Check if the property exists and all window properties
		const result = await page.evaluate(() => {
			console.log(
				"All window keys containing 'file':",
				Object.keys(window).filter(k => k.toLowerCase().includes("file")),
			);
			console.log("window.fileUploaderMounted:", window.fileUploaderMounted);
			console.log(
				"typeof window.fileUploaderMounted:",
				typeof window.fileUploaderMounted,
			);

			// Try to set it manually to see if that works

			return {
				fileUploaderMounted: window.fileUploaderMounted,
				allFileKeys: Object.keys(window).filter(k =>
					k.toLowerCase().includes("file"),
				),
			};
		});

		console.log("Evaluation result:", result);

		// Wait a bit more and check again
		await page.waitForTimeout(2000);

		const finalResult = await page.evaluate(() => {
			console.log(
				"Final check - window.fileUploaderMounted:",
				window.fileUploaderMounted,
			);
			return window.fileUploaderMounted;
		});

		console.log("Final fileUploaderMounted result:", finalResult);
		expect(finalResult).toBe(true);
	});
});
