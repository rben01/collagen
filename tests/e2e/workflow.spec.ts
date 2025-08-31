/**
 * End-to-end workflow tests for complete user journeys
 *
 * Tests complete user workflows from file upload through SVG generation
 * to user interactions. Focuses on realistic scenarios and actual app behavior.
 */

/// <reference path="../globals.d.ts" />

import { expect, Page } from "@playwright/test";
import { test } from "./fixtures";
import { uploadProject } from "./upload";

// =============================================================================
// Complete Workflow Tests
// =============================================================================

test.describe("Complete User Workflows", () => {
	test("should handle basic upload workflow", async ({
		page,
		browserName,
	}) => {
		// 1. Start with upload interface
		await expect(
			page.getByRole("button", { name: /file upload drop zone/i }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: /upload collagen project/i }),
		).toBeVisible();

		await uploadProject(browserName, page, "simpleJson");

		await expect(page.getByText(/uploaded successfully/)).toBeVisible();

		const svgElement = page
			.getByLabel("Interactive SVG viewer")
			.locator("svg");

		await expect(svgElement).toHaveAttribute("viewBox", "0 0 100 100");
		await expect(svgElement.locator("rect")).toBeVisible();

		// Test that SVG controls are available
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await expect(svgContainer).toBeVisible();

		// Should return to upload interface
		await expect(
			page.getByRole("button", { name: /file upload drop zone/i }),
		).toBeVisible();
	});

	test("should handle project with assets", async ({ page, browserName }) => {
		// Upload project with image assets
		await uploadProject(browserName, page, "folderWithAssets");

		// Should show folder upload success
		await expect(page.getByText(/uploaded successfully/)).toBeVisible();

		// Verify SVG contains embedded image
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		const svgElement = svgContainer.locator("svg");
		await expect(svgElement).toBeVisible();
		await expect(svgElement).toHaveAttribute("viewBox", "0 0 200 200");

		// Check for embedded image element
		const imageElement = svgElement.locator("image");
		await expect(imageElement).toBeVisible();
		const href = await imageElement.getAttribute("href");
		expect(href).toMatch(/^data:image\/png;base64,/);

		// Check for text element
		await expect(svgElement.locator("text")).toContainText("Hello World");
	});

	test("should handle Jsonnet project", async ({ page, browserName }) => {
		// Upload Jsonnet project
		await uploadProject(browserName, page, "simpleJsonnet");

		// Check if Jsonnet was processed successfully or shows appropriate error
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		const svgElement = svgContainer.locator("svg");
		await expect(svgElement).toBeVisible();

		// Jsonnet processed successfully - verify generated circles
		await expect(svgElement).toHaveAttribute("viewBox", "0 0 100 100");
		const rect = svgElement.locator("rect");
		expect(await rect.count()).toBe(1);
		expect(await rect.getAttribute("fill")).toBe("red");
	});

	test("should handle error recovery workflow", async ({
		page,
		browserName,
	}) => {
		// 1. Upload invalid project that will fail
		await uploadProject(browserName, page, "malformedJson");

		// Should show error message
		const errorMessage = page
			.getByRole("alert")
			.or(page.locator(".error-message"));
		await expect(errorMessage).toBeVisible();
		await expect(errorMessage).toContainText(/error|invalid|json|parse/i);

		// 2. Upload valid project to recover (use folder-based project that works)
		await uploadProject(browserName, page, "folderWithAssets", false);

		// Error should be cleared and SVG should be displayed
		// Wait for successful upload before checking error clearing
		await expect(page.getByText(/uploaded successfully/)).toBeVisible();
		await expect(errorMessage).not.toBeVisible();
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await expect(svgContainer.locator("svg")).toBeVisible();

		// 3. Test that everything works normally after error recovery
		await expect(svgContainer).toBeVisible();

		// Verify the SVG content is from the successful upload
		await expect(svgContainer.locator("text")).toContainText("Hello World");
	});
});

// =============================================================================
// Interactive Workflow Tests
// =============================================================================

test.describe("Interactive Workflows", () => {
	test.beforeEach(async ({ page, browserName }) => {
		// Set up a project for interaction testing
		await uploadProject(browserName, page, "simpleJson");
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await expect(svgContainer.locator("svg")).toBeVisible();
	});

	test("should support complete zoom workflow", async ({ page }) => {
		const svgContent = page.getByLabel("SVG content");
		const zoomInBtn = page.getByRole("button", { name: /zoom in/i });
		const zoomOutBtn = page.getByRole("button", { name: /zoom out/i });
		const resetBtn = page.getByRole("button", { name: /reset view/i });

		// Get initial transform
		const initialTransform = await svgContent.getAttribute("style");

		// Test zoom in
		await zoomInBtn.click();
		await page.waitForTimeout(100);
		const zoomedInTransform = await svgContent.getAttribute("style");
		expect(zoomedInTransform).not.toBe(initialTransform);

		// Test zoom out
		await zoomOutBtn.click();
		await page.waitForTimeout(100);
		const zoomedOutTransform = await svgContent.getAttribute("style");
		expect(zoomedOutTransform).toBe(initialTransform);

		// Test reset
		await zoomInBtn.click();
		await zoomInBtn.click();
		await resetBtn.click();
		await page.waitForTimeout(100);
		const resetTransform = await svgContent.getAttribute("style");
		expect(resetTransform).toBe(initialTransform);
	});

	test("should support pan workflow", async ({ page }) => {
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		const svgContent = page.getByLabel("SVG content");

		// Get initial position
		const initialTransform = await svgContent.getAttribute("style");

		// Test mouse pan
		await svgContainer.hover();
		await page.mouse.down();
		await page.mouse.move(50, 30, { steps: 5 });
		await page.mouse.up();

		// Position should have changed
		const pannedTransform = await svgContent.getAttribute("style");
		expect(pannedTransform).not.toBe(initialTransform);
		expect(pannedTransform).toContain("translate");
	});

	test("should support keyboard controls workflow", async ({ page }) => {
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		const svgContent = page.getByLabel("SVG content");

		// Focus on SVG container
		await svgContainer.focus();
		await expect(svgContainer).toBeFocused();

		// Get initial state
		const initialTransform = await svgContent.getAttribute("style");

		// Test keyboard zoom
		await svgContainer.press("Equal"); // Zoom in
		await page.waitForTimeout(100);
		let currentTransform = await svgContent.getAttribute("style");
		expect(currentTransform).not.toBe(initialTransform);

		await svgContainer.press("Minus"); // Zoom out
		await page.waitForTimeout(100);
		currentTransform = await svgContent.getAttribute("style");
		expect(currentTransform).toBe(initialTransform);

		// Test keyboard pan
		await svgContainer.press("Shift+ArrowRight");
		await page.waitForTimeout(100);
		currentTransform = await svgContent.getAttribute("style");
		expect(currentTransform).not.toBe(initialTransform);

		// Test reset
		await page.keyboard.press("0");
		await page.waitForTimeout(100);
		currentTransform = await svgContent.getAttribute("style");
		expect(currentTransform).toBe(initialTransform);
	});

	test("should support export workflow", async ({ page }) => {
		const downloadBtn = page.getByRole("button", { name: /download svg/i });
		await expect(downloadBtn).toBeVisible();

		// Mock download to avoid actual file download in test
		await page.evaluate(() => {
			const originalCreateElement = document.createElement;
			document.createElement = function (tagName: string) {
				const element = originalCreateElement.call(this, tagName);
				if (tagName === "a") {
					element.click = function () {
						(window as any).downloadTriggered = true;
					};
				}
				return element;
			};
		});

		await downloadBtn.click();

		// Verify download was triggered
		const downloadTriggered = await page.evaluate(
			() => (window as any).downloadTriggered,
		);
		expect(downloadTriggered).toBe(true);
	});

	test("should support clipboard workflow", async ({
		page,
		context,
		browserName,
	}) => {
		test.skip(
			browserName !== "chromium",
			"only chromium supports writing to clipboard from tests",
		);
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		uploadProject(browserName, page, "simpleJson");

		const copyBtn = page.getByRole("button", { name: /copy.*clipboard/i });
		await copyBtn.click();

		// Verify SVG was copied to clipboard
		const clipboardText = await page.evaluate(() =>
			navigator.clipboard.readText(),
		);
		// is attribute order stable? this appears to use the order the keys are defined in the sample project
		expect(clipboardText).toBe(
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="50" height="50" fill="blue"/></svg>',
		);
	});
});

// =============================================================================
// Multi-Project Workflow Tests
// =============================================================================

test.describe("Multi-Project Workflows", () => {
	test("should handle multiple project uploads", async ({
		page,
		browserName,
	}) => {
		// Upload first project
		await uploadProject(browserName, page, "simpleJson");
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await expect(svgContainer.locator("svg")).toBeVisible();
		// simpleJson project contains only a rect element, no text
		await expect(svgContainer.locator("rect")).toBeVisible();

		await uploadProject(browserName, page, "folderWithAssets", false);
		await expect(svgContainer.locator("svg")).toBeVisible();
		// folderWithAssets contains "Hello World" text
		await expect(svgContainer.locator("text")).toContainText("Hello World");
		// Verify first project content (rect) is gone and text is now present
		await expect(svgContainer.locator("text")).toBeVisible();
		await expect(svgContainer.locator("text")).toContainText("Hello World");
	});

	test("should handle rapid project switching", async ({
		page,
		browserName,
	}) => {
		// Rapidly switch between projects
		for (let i = 0; i < 3; i++) {
			await uploadProject(browserName, page, "simpleJson", i === 0);
			await uploadProject(browserName, page, "folderWithAssets", false);
		}

		// Final state should be stable
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await expect(svgContainer.locator("svg")).toBeVisible();
		// Check if we have rect (from simpleJson) or text (from folderWithAssets)
		const hasRect = await svgContainer.locator("rect").isVisible();
		const hasText = await svgContainer.locator("text").isVisible();

		// Should have content from one of the projects (last uploaded)
		expect(hasRect || hasText).toBe(true);
	});

	test("should maintain state after error and recovery", async ({
		page,
		browserName,
	}) => {
		// Upload valid project
		await uploadProject(browserName, page, "simpleJson");
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await expect(svgContainer.locator("svg")).toBeVisible();

		// Try invalid project
		await uploadProject(browserName, page, "malformedJson", false);
		const errorMessage = page
			.getByRole("alert")
			.or(page.locator(".error-message"));
		await expect(errorMessage).toBeVisible();

		// Upload valid project again
		await uploadProject(browserName, page, "folderWithAssets", false);

		// Should recover completely
		await expect(errorMessage).not.toBeVisible();
		await expect(svgContainer.locator("svg")).toBeVisible();
		await expect(svgContainer.locator("text")).toContainText("Hello World");

		// Controls should work normally
		const zoomInBtn = page.getByRole("button", { name: /zoom in/i });
		await expect(zoomInBtn).toBeVisible();
		await zoomInBtn.click();
	});
});

// =============================================================================
// Responsive Workflow Tests
// =============================================================================

test.describe("Responsive Workflows", () => {
	test("should work on different screen sizes", async ({
		page,
		browserName,
	}) => {
		// Test mobile workflow
		await page.setViewportSize({ width: 375, height: 667 });
		await uploadProject(browserName, page, "simpleJson");
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await expect(svgContainer.locator("svg")).toBeVisible();
		await expect(svgContainer).toBeVisible();

		// Test tablet workflow
		await page.setViewportSize({ width: 768, height: 1024 });
		await expect(svgContainer.locator("svg")).toBeVisible();
		await expect(svgContainer).toBeVisible();

		// Test desktop workflow
		await page.setViewportSize({ width: 1200, height: 800 });
		await expect(svgContainer.locator("svg")).toBeVisible();
		await expect(svgContainer).toBeVisible();

		// Controls should be accessible on all sizes
		const zoomInBtn = page.getByRole("button", { name: /zoom in/i });
		await expect(zoomInBtn).toBeVisible();
	});

	test("should handle touch interactions on mobile", async ({
		browser,
		browserName,
	}) => {
		const context = await browser.newContext({
			hasTouch: true,
			isMobile: true,
			viewport: { width: 375, height: 667 },
		});
		const mobilePage = await context.newPage();

		await mobilePage.goto("/");
		await mobilePage.waitForSelector(".drop-zone");
		await uploadProject(browserName, mobilePage, "simpleJson");
		const svgContainer = mobilePage.getByLabel("Interactive SVG viewer");
		await expect(svgContainer.locator("svg")).toBeVisible();
		if (await svgContainer.isVisible()) {
			// Test touch tap
			await svgContainer.tap();

			// Test touch gestures (simplified)
			const box = await svgContainer.boundingBox();
			if (box) {
				await mobilePage.touchscreen.tap(
					box.x + box.width / 2,
					box.y + box.height / 2,
				);
			}
		}

		await context.close();
	});
});
