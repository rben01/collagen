import { test, expect } from "@playwright/test";
import { uploadProject } from "./upload";

test.describe("Keyboard Shortcuts", () => {
	test("plain +/- keys should zoom SVG viewer", async ({
		page,
		browserName,
	}) => {
		await page.goto("/");

		// Upload a basic manifest
		await uploadProject(
			browserName as "chromium" | "webkit" | "firefox",
			page,
			"simpleJson",
		);

		// Wait for SVG to be generated and displayed
		await expect(
			page.locator('[aria-label="Interactive SVG viewer"]'),
		).toBeVisible();

		// Focus the SVG viewer
		await page.locator('[aria-label="Interactive SVG viewer"]').click();

		// Get initial zoom level
		const initialZoomText = await page.locator(".zoom-level").textContent();
		const initialZoom = parseInt(initialZoomText?.replace("%", "") || "100");

		// Test zoom in with + key
		await page.keyboard.press("+");

		// Wait for zoom to update
		await expect(page.locator(".zoom-level")).not.toHaveText(
			initialZoomText!,
		);

		const newZoomText = await page.locator(".zoom-level").textContent();
		const newZoom = parseInt(newZoomText?.replace("%", "") || "100");

		expect(newZoom).toBeGreaterThan(initialZoom);

		// Test zoom out with - key
		await page.keyboard.press("-");

		// Wait for zoom to update back
		await expect(page.locator(".zoom-level")).toHaveText(`${initialZoom}%`);
	});

	test("Cmd/Meta + +/- keys should not affect SVG viewer zoom", async ({
		page,
		browserName,
	}) => {
		await page.goto("/");

		// Upload a basic manifest
		await uploadProject(
			browserName as "chromium" | "webkit" | "firefox",
			page,
			"simpleJson",
		);

		// Wait for SVG to be generated and displayed
		await expect(
			page.locator('[aria-label="Interactive SVG viewer"]'),
		).toBeVisible();

		// Focus the SVG viewer
		await page.locator('[aria-label="Interactive SVG viewer"]').click();

		// Get initial zoom level
		const initialZoomText = await page.locator(".zoom-level").textContent();

		// Test Cmd/Meta + Plus (should not affect SVG zoom)
		await page.keyboard.press("Meta++");

		// SVG zoom should remain unchanged (browser zoom might change, but that's expected)
		await expect(page.locator(".zoom-level")).toHaveText(initialZoomText!);

		// Test Cmd/Meta + Minus (should not affect SVG zoom)
		await page.keyboard.press("Meta+-");

		// SVG zoom should remain unchanged
		await expect(page.locator(".zoom-level")).toHaveText(initialZoomText!);
	});

	test("Ctrl + +/- keys should not affect SVG viewer zoom", async ({
		page,
		browserName,
	}) => {
		await page.goto("/");

		// Upload a basic manifest
		await uploadProject(
			browserName as "chromium" | "webkit" | "firefox",
			page,
			"simpleJson",
		);

		// Wait for SVG to be generated and displayed
		await expect(
			page.locator('[aria-label="Interactive SVG viewer"]'),
		).toBeVisible();

		// Focus the SVG viewer
		await page.locator('[aria-label="Interactive SVG viewer"]').click();

		// Get initial zoom level
		const initialZoomText = await page.locator(".zoom-level").textContent();

		// Test Ctrl + Plus (should not affect SVG zoom)
		await page.keyboard.press("Control++");

		// SVG zoom should remain unchanged
		await expect(page.locator(".zoom-level")).toHaveText(initialZoomText!);

		// Test Ctrl + Minus (should not affect SVG zoom)
		await page.keyboard.press("Control+-");

		// SVG zoom should remain unchanged
		await expect(page.locator(".zoom-level")).toHaveText(initialZoomText!);
	});

	test("Alt + +/- keys should not affect SVG viewer zoom", async ({
		page,
		browserName,
	}) => {
		await page.goto("/");

		// Upload a basic manifest
		await uploadProject(
			browserName as "chromium" | "webkit" | "firefox",
			page,
			"simpleJson",
		);

		// Wait for SVG to be generated and displayed
		await expect(
			page.locator('[aria-label="Interactive SVG viewer"]'),
		).toBeVisible();

		// Focus the SVG viewer
		await page.locator('[aria-label="Interactive SVG viewer"]').click();

		// Get initial zoom level
		const initialZoomText = await page.locator(".zoom-level").textContent();

		// Test Alt + Plus (should not affect SVG zoom)
		await page.keyboard.press("Alt++");

		// SVG zoom should remain unchanged
		await expect(page.locator(".zoom-level")).toHaveText(initialZoomText!);

		// Test Alt + Minus (should not affect SVG zoom)
		await page.keyboard.press("Alt+-");

		// SVG zoom should remain unchanged
		await expect(page.locator(".zoom-level")).toHaveText(initialZoomText!);
	});

	test("= key should also zoom in SVG viewer", async ({
		page,
		browserName,
	}) => {
		await page.goto("/");

		// Upload a basic manifest
		await uploadProject(
			browserName as "chromium" | "webkit" | "firefox",
			page,
			"simpleJson",
		);

		// Wait for SVG to be generated and displayed
		await expect(
			page.locator('[aria-label="Interactive SVG viewer"]'),
		).toBeVisible();

		// Focus the SVG viewer
		await page.locator('[aria-label="Interactive SVG viewer"]').click();

		// Get initial zoom level
		const initialZoomText = await page.locator(".zoom-level").textContent();
		const initialZoom = parseInt(initialZoomText?.replace("%", "") || "100");

		// Test zoom in with = key (alternative to + key)
		await page.keyboard.press("=");

		// Wait for zoom to update
		await expect(page.locator(".zoom-level")).not.toHaveText(
			initialZoomText!,
		);

		const newZoomText = await page.locator(".zoom-level").textContent();
		const newZoom = parseInt(newZoomText?.replace("%", "") || "100");

		expect(newZoom).toBeGreaterThan(initialZoom);
	});
});
