/**
 * Playwright tests for SvgDisplay component
 *
 * Tests SVG rendering, zoom/pan functionality, export features,
 * and interactive controls using standard sample projects.
 */

import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { uploadProject } from "./upload";

// =============================================================================
// Basic SvgDisplay Tests
// =============================================================================

test.describe("SvgDisplay Component", () => {
	test("should not display initially without SVG", async ({ page }) => {
		// SVG display section should not be visible initially
		const svgSection = page.getByRole("region", {
			name: /generated svg display/i,
		});
		await expect(svgSection).not.toBeVisible();
	});

	test("should display SVG when provided", async ({ page, browserName }) => {
		// Upload a simple JSON project
		await uploadProject(browserName, page, "simpleJson");

		// SVG container should be visible
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await expect(svgContainer).toBeVisible();

		// SVG element should be present with correct attributes
		const svgElement = svgContainer.locator("svg");
		await expect(svgElement).toBeVisible();
		await expect(svgElement).toHaveAttribute("viewBox", "0 0 100 100");

		// Verify content elements are present (simpleJson has a blue rect)
		await expect(svgElement.locator("rect")).toBeVisible();
		const rect = svgElement.locator("rect");
		await expect(rect).toHaveAttribute("fill", "blue");
	});

	test("should display complex SVG with multiple elements", async ({
		page,
		browserName,
	}) => {
		// Upload project with assets (has image and text)
		await uploadProject(browserName, page, "folderWithAssets");

		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await expect(svgContainer).toBeVisible();

		const svgElement = svgContainer.locator("svg");
		await expect(svgElement).toBeVisible();
		await expect(svgElement).toHaveAttribute("viewBox", "0 0 200 200");

		// Verify multiple element types are present
		await expect(svgElement.locator("image")).toBeVisible();
		await expect(svgElement.locator("text")).toBeVisible();
		await expect(svgElement.locator("text")).toContainText("Hello World");
	});
});

// =============================================================================
// SVG Controls Tests
// =============================================================================

test.describe("SVG Controls", () => {
	test.beforeEach(async ({ page, browserName }) => {
		// Set up with simple JSON project for control testing
		await uploadProject(browserName, page, "simpleJson");
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await expect(svgContainer.locator("svg")).toBeVisible();
	});

	test("should display control buttons", async ({ page }) => {
		// Check all control buttons are present
		await expect(
			page.getByRole("button", { name: /zoom in.*keyboard/i }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: /zoom out.*keyboard/i }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: /reset view.*keyboard/i }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: /download svg.*keyboard/i }),
		).toBeVisible();

		// Check button titles
		await expect(
			page.getByRole("button", { name: /zoom in.*keyboard/i }),
		).toHaveAttribute("title", "Zoom In (Keyboard: +)");
		await expect(
			page.getByRole("button", { name: /zoom out.*keyboard/i }),
		).toHaveAttribute("title", "Zoom Out (Keyboard: -)");
		await expect(
			page.getByRole("button", { name: /reset view.*keyboard/i }),
		).toHaveAttribute("title", "Reset View (Keyboard: 0)");
		await expect(
			page.getByRole("button", { name: /download svg.*keyboard/i }),
		).toHaveAttribute("title", "Download SVG (Keyboard: S)");
	});

	test("should handle zoom in action", async ({ page }) => {
		const zoomInBtn = page.getByRole("button", { name: /zoom in/i });
		const svgContent = page.getByLabel("SVG content");

		const initialTransform = await svgContent.getAttribute("style");

		await zoomInBtn.click();
		await page.waitForTimeout(100);

		const finalTransform = await svgContent.getAttribute("style");
		expect(initialTransform).not.toBe(finalTransform);
	});

	test("should handle zoom out action", async ({ page }) => {
		const zoomOutBtn = page.getByLabel(
			"Zoom out, keyboard shortcut minus key",
		);
		const svgContent = page.getByLabel("SVG content");
		const zoomLevel = page.locator(".zoom-level");

		// Initial zoom should be 100%
		await expect(zoomLevel).toContainText("100%");

		// Get initial transform
		const initialTransform = await svgContent.getAttribute("style");

		// Click zoom out
		await zoomOutBtn.click();
		await page.waitForTimeout(100);

		// Transform should change (scale should decrease)
		const finalTransform = await svgContent.getAttribute("style");
		expect(initialTransform).not.toBe(finalTransform);
		await expect(zoomLevel).toContainText("83%"); // 100% / 1.2 = 83%
	});

	test("should handle reset view action", async ({ page }) => {
		const svgContent = page.getByLabel("SVG content");
		const zoomInBtn = page.getByLabel("Zoom in, keyboard shortcut plus key");
		const resetBtn = page.getByLabel(
			"Reset view, keyboard shortcut zero key",
		);
		const zoomLevel = page.locator(".zoom-level");

		// Click zoom in twice to change the scale
		await zoomInBtn.click();
		await zoomInBtn.click();
		await page.waitForTimeout(100);

		// Verify zoom level changed
		await expect(zoomLevel).toContainText("144%"); // 100% * 1.2 * 1.2 = 144%

		// Get the modified transform
		const modifiedTransform = await svgContent.getAttribute("style");

		// Click reset button
		await resetBtn.click();
		await page.waitForTimeout(100);

		// Should reset to 100% and different transform
		await expect(zoomLevel).toContainText("100%");
		const resetTransform = await svgContent.getAttribute("style");
		expect(resetTransform).not.toBe(modifiedTransform);
	});

	test("should handle export action and show toast", async ({ page }) => {
		const exportBtn = page.getByLabel(
			"Download SVG file, keyboard shortcut S key",
		);

		// Click export
		await exportBtn.click();
		await page.waitForTimeout(100);

		// Should show toast notification
		const toast = page.locator(".toast").first();
		await expect(toast).toBeVisible();
		await expect(toast).toContainText("SVG downloaded");
	});

	test("should handle copy to clipboard action", async ({
		page,
		browserName,
		context,
	}) => {
		test.skip(
			browserName !== "chromium",
			"only chromium supports writing to clipboard from tests",
		);
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);

		const copyBtn = page.getByLabel(
			"Copy SVG to clipboard, keyboard shortcut C key",
		);

		// Click copy
		await copyBtn.click();
		await page.waitForTimeout(100);

		// Check clipboard content
		const clipboardData = await page.evaluate(
			async () => await navigator.clipboard.readText(),
		);
		expect(clipboardData).toContain("<svg");
		expect(clipboardData).toContain('viewBox="0 0 100 100"');

		// Should show success toast
		const toast = page.locator(".toast").first();
		await expect(toast).toBeVisible();
		await expect(toast).toContainText("SVG copied to clipboard");
	});

	test("should handle clipboard copy error", async ({ page }) => {
		const copyBtn = page.getByLabel(
			"Copy SVG to clipboard, keyboard shortcut C key",
		);

		// Mock clipboard API to fail
		await page.evaluate(() => {
			// Define a custom clipboard object that fails
			Object.defineProperty(navigator, "clipboard", {
				value: {
					writeText: () => {
						return Promise.reject(new Error("Clipboard access denied"));
					},
				},
				configurable: true,
				writable: true,
			});
		});

		// Click copy
		await copyBtn.click();
		await page.waitForTimeout(100);

		// Should show error toast
		const toast = page.locator(".toast").first();
		await expect(toast).toBeVisible();
		await expect(toast).toContainText("Failed to copy SVG to clipboard");
		await expect(toast).toHaveClass(/toast-error/);
	});

	test("should toggle code view", async ({ page }) => {
		const toggleBtn = page.getByLabel(
			"Toggle between preview and code view, keyboard shortcut V key",
		);
		const svgContainer = page.getByLabel("Interactive SVG viewer");

		// Initially should show SVG viewer
		await expect(svgContainer).toBeVisible();

		// Click toggle to show raw SVG
		await toggleBtn.click();
		await page.waitForTimeout(100);

		// Should show raw SVG code
		const rawSvg = page.getByRole("region", { name: /raw SVG code/i });
		await expect(rawSvg).toBeVisible();
		await expect(rawSvg.locator("code")).toContainText("<svg");
		await expect(svgContainer).not.toBeVisible();

		// Toggle back to preview
		await toggleBtn.click();
		await page.waitForTimeout(100);

		// Should show SVG viewer again
		await expect(svgContainer).toBeVisible();
		await expect(rawSvg).not.toBeVisible();
	});

	test("should toggle usage instructions", async ({ page }) => {
		const helpBtn = page.getByLabel(
			"Toggle usage instructions, keyboard shortcut question mark key",
		);
		const instructions = page.locator(
			".instructions[aria-label='Usage instructions']",
		);

		// Initially instructions should not be visible
		await expect(instructions).not.toBeVisible();

		// Click to show instructions
		await helpBtn.click();
		await page.waitForTimeout(100);

		// Should show instructions
		await expect(instructions).toBeVisible();
		await expect(instructions).toContainText("How to Use the SVG Viewer");
		await expect(instructions).toContainText("Zoom & Pan");
		await expect(instructions).toContainText("Actions");

		// Toggle off
		await helpBtn.click();
		await page.waitForTimeout(100);

		// Should hide instructions
		await expect(instructions).not.toBeVisible();
	});
});

// =============================================================================
// Interactive Features Tests
// =============================================================================

test.describe("Interactive Features", () => {
	test.beforeEach(async ({ page, browserName }) => {
		// Use project with assets for more interactive elements
		await uploadProject(browserName, page, "folderWithAssets");
		// Verify upload success
		await expect(page.getByText(/uploaded successfully/)).toBeVisible();
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await expect(svgContainer.locator("svg")).toBeVisible();
	});

	test("should handle mouse pan interaction", async ({ page }) => {
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		const svgContent = page.getByLabel("SVG content");

		// Get initial transform
		const initialTransform = await svgContent.getAttribute("style");

		// Simulate pan gesture on the container (which handles events)
		await svgContainer.hover();
		await page.mouse.down();
		await page.mouse.move(100, 50); // Move 100px right, 50px down
		await page.mouse.up();

		// Wait for interaction
		await page.waitForTimeout(100);

		// Transform should have changed (applied to svg-content)
		const newTransform = await svgContent.getAttribute("style");
		expect(newTransform).not.toBe(initialTransform);
		// Verify the transform includes translation
		expect(newTransform).toContain("translate");
	});

	test("should handle wheel zoom with Ctrl key", async ({
		page,
		isMobile,
	}) => {
		if (!isMobile) {
			const svgContainer = page.getByLabel("Interactive SVG viewer");
			const svgContent = page.getByLabel("SVG content");
			const zoomLevel = page.locator(".zoom-level");

			// Initial zoom should be 100%
			await expect(zoomLevel).toContainText("100%");

			// Get initial scale
			const initialTransform = await svgContent.getAttribute("style");

			// Simulate Ctrl+wheel zoom on the container
			await svgContainer.hover();
			await page.keyboard.down("Control");
			await page.mouse.wheel(0, -100); // Zoom in
			await page.keyboard.up("Control");

			// Wait for interaction
			await page.waitForTimeout(100);

			// Transform should reflect zoom and zoom level should increase
			const newTransform = await svgContent.getAttribute("style");
			expect(newTransform).not.toBe(initialTransform);
			expect(newTransform).toContain("scale");
		}
	});

	test("should not zoom without Ctrl key", async ({ page, isMobile }) => {
		if (!isMobile) {
			const svgContainer = page.getByLabel("Interactive SVG viewer");
			const svgContent = page.getByLabel("SVG content");
			const zoomLevel = page.locator(".zoom-level");

			// Initial zoom should be 100%
			await expect(zoomLevel).toContainText("100%");

			// Get initial scale
			const initialTransform = await svgContent.getAttribute("style");

			// Simulate wheel without Ctrl (should not zoom)
			await svgContainer.hover();
			await page.mouse.wheel(0, -100);

			// Wait for potential interaction
			await page.waitForTimeout(100);

			// Transform and zoom level should remain unchanged
			const newTransform = await svgContent.getAttribute("style");
			expect(initialTransform).toBe(newTransform);
			await expect(zoomLevel).toContainText("100%");
		}
	});

	test("should change cursor during pan", async ({ page }) => {
		const svgContainer = page.getByLabel("Interactive SVG viewer");

		// Initial cursor should be grab
		await expect(svgContainer).toHaveCSS("cursor", "grab");

		// During pan, cursor should change to grabbing
		await svgContainer.hover();
		await page.mouse.down();

		// Wait for cursor change
		await page.waitForTimeout(50);

		// Cursor should be grabbing during drag
		await expect(svgContainer).toHaveCSS("cursor", "grabbing");

		await page.mouse.up();

		// Wait for cursor to revert
		await page.waitForTimeout(50);

		// Cursor should return to grab
		await expect(svgContainer).toHaveCSS("cursor", "grab");
	});

	test("should handle keyboard shortcuts globally", async ({ page }) => {
		const svgContent = page.getByLabel("SVG content");
		const zoomLevel = page.locator(".zoom-level");

		// Global shortcuts should work without focus
		const initialTransform = await svgContent.getAttribute("style");
		let previousTransform = initialTransform;
		let thisTransform: string | null = null;
		await expect(zoomLevel).toContainText("100%");

		// Test global zoom shortcuts (+ and -)
		await page.keyboard.press("Equal"); // Zoom in
		await page.waitForTimeout(100);
		await expect(zoomLevel).toContainText("120%");
		thisTransform = await svgContent.getAttribute("style");
		expect(thisTransform).not.toEqual(previousTransform);
		previousTransform = thisTransform;

		await page.keyboard.press("Minus"); // Zoom out
		await page.waitForTimeout(100);
		await expect(zoomLevel).toContainText("100%");
		thisTransform = await svgContent.getAttribute("style");
		expect(thisTransform).not.toEqual(previousTransform);
		previousTransform = thisTransform;

		await page.keyboard.press("Minus"); // Zoom in
		await page.waitForTimeout(100);
		await expect(zoomLevel).toContainText("83%");
		thisTransform = await svgContent.getAttribute("style");
		expect(thisTransform).not.toEqual(previousTransform);
		previousTransform = thisTransform;

		// Test reset shortcut
		await page.keyboard.press("Equal"); // Zoom in first
		await page.keyboard.press("0"); // Reset
		await page.waitForTimeout(100);
		await expect(zoomLevel).toContainText("100%");
		thisTransform = await svgContent.getAttribute("style");
		expect(thisTransform).not.toEqual(previousTransform);
		previousTransform = thisTransform;

		// Test view toggle shortcut
		await page.keyboard.press("v");
		await page.waitForTimeout(100);
		const rawSvg = page.locator(".raw-svg");
		await expect(rawSvg).toBeVisible();

		// Toggle back
		await page.keyboard.press("v");
		await page.waitForTimeout(100);
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await expect(svgContainer).toBeVisible();
	});

	test("should handle focus-required pan shortcuts", async ({ page }) => {
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		const svgContent = page.getByLabel("SVG content");

		// Focus the container first
		await svgContainer.focus();
		await expect(svgContainer).toBeFocused();

		const initialTransform = await svgContent.getAttribute("style");

		// Test Shift+arrow key pan (focus required)
		await page.keyboard.press("Shift+ArrowRight");
		await page.keyboard.press("Shift+ArrowDown");
		await page.waitForTimeout(100);

		// Transform should have changed (pan applied)
		const panTransform = await svgContent.getAttribute("style");
		expect(panTransform).not.toBe(initialTransform);
		expect(panTransform).toContain("translate");
	});

	test("should not pan without focus", async ({ page }) => {
		const svgContent = page.getByLabel("SVG content");
		const svgContainer = page.getByLabel("Interactive SVG viewer");

		// Ensure nothing is focused by clicking elsewhere
		await page.locator("body").click();
		await page.waitForTimeout(100);

		// Verify container is not focused
		await expect(svgContainer).not.toBeFocused();

		// Get initial transform
		const initialTransform = await svgContent.getAttribute("style");

		// Try to pan without focus (should not work)
		await page.keyboard.press("Shift+ArrowRight");
		await page.keyboard.press("Shift+ArrowDown");
		await page.waitForTimeout(100);

		// Transform should remain unchanged
		const unchangedTransform = await svgContent.getAttribute("style");
		expect(unchangedTransform).toBe(initialTransform);
	});
});

// =============================================================================
// Complex SVG Handling Tests
// =============================================================================

test.describe("Complex SVG Handling", () => {
	test("should handle multiple elements without performance issues", async ({
		page,
		browserName,
	}) => {
		// Use project with multiple files which creates multiple elements
		await uploadProject(browserName, page, "multipleFilesValid");

		// Verify upload success
		await expect(page.getByText(/uploaded successfully/)).toBeVisible();

		// Should handle elements without performance issues
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		const svgElement = svgContainer.locator("svg");
		await expect(svgElement).toBeVisible();
		await expect(svgElement).toHaveAttribute("viewBox", "0 0 150 150");

		// Should contain the circle from multipleFilesValid
		const circle = svgElement.locator("circle");
		await expect(circle).toBeVisible();
		await expect(circle).toHaveAttribute("fill", "purple");

		// Interactive controls should still work with multiple elements
		const zoomInBtn = page.getByLabel("Zoom in, keyboard shortcut plus key");
		await zoomInBtn.click();
		await page.waitForTimeout(100);

		const zoomLevel = page.locator(".zoom-level");
		await expect(zoomLevel).toContainText("120%");
	});

	test("should handle malformed content gracefully", async ({
		page,
		browserName,
	}) => {
		// Upload malformed JSON project
		await uploadProject(browserName, page, "malformedJson");

		// Should show error message instead of success
		const errorMessage = page
			.getByRole("alert")
			.or(page.locator(".error-message"));
		await expect(errorMessage).toBeVisible();
		await expect(errorMessage).toContainText(/error|invalid|json|parse/i);

		// SVG should not be visible when there's an error
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await expect(svgContainer).not.toBeVisible();
	});

	test("should handle projects with different viewBox dimensions", async ({
		page,
		browserName,
	}) => {
		// Test with folderWithAssets which has 200x200 viewBox
		await uploadProject(browserName, page, "folderWithAssets");

		// Verify upload success
		await expect(page.getByText(/uploaded successfully/)).toBeVisible();

		const svgContainer = page.getByLabel("Interactive SVG viewer");
		const svgElement = svgContainer.locator("svg");
		await expect(svgElement).toBeVisible();
		await expect(svgElement).toHaveAttribute("viewBox", "0 0 200 200");

		// Should still be interactive with larger viewBox
		const zoomInBtn = page.getByLabel("Zoom in, keyboard shortcut plus key");
		await zoomInBtn.click();
		await page.waitForTimeout(100);

		// Zoom controls should work with any viewBox size
		const zoomLevel = page.locator(".zoom-level");
		await expect(zoomLevel).toContainText("120%");

		// Pan should work with different viewBox sizes
		const svgContent = page.getByLabel("SVG content");
		const initialTransform = await svgContent.getAttribute("style");

		await svgContainer.hover();
		await page.mouse.down();
		await page.mouse.move(50, 30);
		await page.mouse.up();
		await page.waitForTimeout(100);

		const newTransform = await svgContent.getAttribute("style");
		expect(newTransform).not.toBe(initialTransform);
	});

	test("should handle rapid interactions without breaking state", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, "simpleJson");

		// Verify upload success
		await expect(page.getByText(/uploaded successfully/)).toBeVisible();

		const zoomInBtn = page.getByLabel("Zoom in, keyboard shortcut plus key");
		const zoomOutBtn = page.getByLabel(
			"Zoom out, keyboard shortcut minus key",
		);
		const resetBtn = page.getByLabel(
			"Reset view, keyboard shortcut zero key",
		);
		const zoomLevel = page.locator(".zoom-level");

		// Rapid clicking should not break state
		await zoomInBtn.click();
		await zoomInBtn.click();
		await zoomOutBtn.click();
		await zoomInBtn.click();
		await resetBtn.click();
		await page.waitForTimeout(100);

		// Should end up at 100% after reset
		await expect(zoomLevel).toContainText("100%");

		// Controls should still be responsive
		await zoomInBtn.click();
		await page.waitForTimeout(50);
		await expect(zoomLevel).toContainText("120%");
	});

	test("should maintain state after toggling between views", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, "simpleJson");

		// Verify upload success
		await expect(page.getByText(/uploaded successfully/)).toBeVisible();

		const zoomInBtn = page.getByLabel("Zoom in, keyboard shortcut plus key");
		const toggleBtn = page.getByLabel(
			"Toggle between preview and code view, keyboard shortcut V key",
		);
		const zoomLevel = page.locator(".zoom-level");

		// Zoom in first
		await zoomInBtn.click();
		await zoomInBtn.click();
		await page.waitForTimeout(100);
		await expect(zoomLevel).toContainText("144%");

		// Toggle to code view
		await toggleBtn.click();
		await page.waitForTimeout(100);
		const rawSvg = page.locator(".raw-svg");
		await expect(rawSvg).toBeVisible();

		// Toggle back to preview
		await toggleBtn.click();
		await page.waitForTimeout(100);

		// Zoom level should be maintained
		await expect(zoomLevel).toContainText("144%");
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await expect(svgContainer).toBeVisible();
	});
});

// =============================================================================
// Responsive and Accessibility Tests
// =============================================================================

test.describe("Responsive and Accessibility", () => {
	test.beforeEach(async ({ page, browserName }) => {
		await uploadProject(browserName, page, "simpleJson");
		// Verify upload success
		await expect(page.getByText(/uploaded successfully/)).toBeVisible();
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await expect(svgContainer.locator("svg")).toBeVisible();
	});

	test("should be responsive on different screen sizes", async ({ page }) => {
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		const svgElement = svgContainer.locator("svg");

		// Test desktop
		await page.setViewportSize({ width: 1200, height: 800 });
		await expect(svgContainer).toBeVisible();
		await expect(svgElement).toBeVisible();

		// Test tablet
		await page.setViewportSize({ width: 768, height: 1024 });
		await expect(svgContainer).toBeVisible();
		await expect(svgElement).toBeVisible();

		// Test mobile
		await page.setViewportSize({ width: 375, height: 667 });
		await expect(svgContainer).toBeVisible();
		await expect(svgElement).toBeVisible();
	});

	test("should have proper ARIA labels and descriptions", async ({ page }) => {
		// Check all control buttons have proper aria-labels
		await expect(
			page.getByLabel("Zoom in, keyboard shortcut plus key"),
		).toBeVisible();
		await expect(
			page.getByLabel("Zoom out, keyboard shortcut minus key"),
		).toBeVisible();
		await expect(
			page.getByLabel("Reset view, keyboard shortcut zero key"),
		).toBeVisible();
		await expect(
			page.getByLabel("Download SVG file, keyboard shortcut S key"),
		).toBeVisible();
		await expect(
			page.getByLabel("Copy SVG to clipboard, keyboard shortcut C key"),
		).toBeVisible();
		await expect(
			page.getByLabel(
				"Toggle between preview and code view, keyboard shortcut V key",
			),
		).toBeVisible();
		await expect(
			page.getByLabel(
				"Toggle usage instructions, keyboard shortcut question mark key",
			),
		).toBeVisible();

		// SVG container should have proper label and describedby
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await expect(svgContainer).toBeVisible();
		await expect(svgContainer).toHaveAttribute(
			"aria-describedby",
			"svg-controls-description",
		);

		// SVG content should have proper role and label
		const svgContent = page.getByLabel("SVG content");
		await expect(svgContent).toHaveAttribute("role", "img");

		// Control toolbar should have proper role and label
		const toolbar = page.getByRole("toolbar", {
			name: "SVG viewer controls",
		});
		await expect(toolbar).toBeVisible();

		// Check hidden description for screen readers
		const description = page.locator("#svg-controls-description");
		await expect(description).toBeAttached(); // Hidden but in DOM
		await expect(description).toContainText("Keyboard controls");
	});

	test("should be keyboard accessible with focusable elements", async ({
		page,
	}) => {
		// Test that all controls can be focused directly
		const zoomInBtn = page.getByLabel("Zoom in, keyboard shortcut plus key");
		await zoomInBtn.focus();
		await expect(zoomInBtn).toBeFocused();

		const zoomOutBtn = page.getByLabel(
			"Zoom out, keyboard shortcut minus key",
		);
		await zoomOutBtn.focus();
		await expect(zoomOutBtn).toBeFocused();

		const resetBtn = page.getByLabel(
			"Reset view, keyboard shortcut zero key",
		);
		await resetBtn.focus();
		await expect(resetBtn).toBeFocused();

		const copyBtn = page.getByLabel(
			"Copy SVG to clipboard, keyboard shortcut C key",
		);
		await copyBtn.focus();
		await expect(copyBtn).toBeFocused();

		const downloadBtn = page.getByLabel(
			"Download SVG file, keyboard shortcut S key",
		);
		await downloadBtn.focus();
		await expect(downloadBtn).toBeFocused();

		// Test SVG container can be focused
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await svgContainer.focus();
		await expect(svgContainer).toBeFocused();
		await expect(svgContainer).toHaveAttribute("tabindex", "0");
	});

	test("should support Enter key activation on buttons", async ({ page }) => {
		const zoomInBtn = page.getByLabel("Zoom in, keyboard shortcut plus key");
		const zoomLevel = page.locator(".zoom-level");

		// Focus and activate with Enter
		await zoomInBtn.focus();
		await expect(zoomInBtn).toBeFocused();
		await expect(zoomLevel).toContainText("100%");

		await page.keyboard.press("Enter");
		await page.waitForTimeout(100);

		// Should zoom in
		await expect(zoomLevel).toContainText("120%");
	});

	test("should support Space key activation on buttons", async ({ page }) => {
		const zoomOutBtn = page.getByLabel(
			"Zoom out, keyboard shortcut minus key",
		);
		const zoomLevel = page.locator(".zoom-level");

		// Focus and activate with Space
		await zoomOutBtn.focus();
		await expect(zoomOutBtn).toBeFocused();
		await expect(zoomLevel).toContainText("100%");

		await page.keyboard.press(" "); // Space key
		await page.waitForTimeout(100);

		// Should zoom out
		await expect(zoomLevel).toContainText("83%");
	});

	test("should support all documented keyboard shortcuts", async ({
		page,
	}) => {
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		const zoomLevel = page.locator(".zoom-level");

		// Test global shortcuts (work without focus)
		await expect(zoomLevel).toContainText("100%");

		// Test + and = keys for zoom in
		await page.keyboard.press("+");
		await page.waitForTimeout(50);
		await expect(zoomLevel).toContainText("120%");

		await page.keyboard.press("="); // Also zoom in
		await page.waitForTimeout(50);
		await expect(zoomLevel).toContainText("144%");

		// Test - key for zoom out
		await page.keyboard.press("-");
		await page.waitForTimeout(50);
		await expect(zoomLevel).toContainText("120%");

		// Test 0 for reset
		await page.keyboard.press("0");
		await page.waitForTimeout(50);
		await expect(zoomLevel).toContainText("100%");

		// Test view toggles
		await page.keyboard.press("v"); // Toggle code view
		await page.waitForTimeout(100);
		const rawSvg = page.locator(".raw-svg");
		await expect(rawSvg).toBeVisible();

		await page.keyboard.press("V"); // Case insensitive
		await page.waitForTimeout(100);
		await expect(svgContainer).toBeVisible();

		// Test help toggle
		await page.keyboard.press("?");
		await page.waitForTimeout(100);
		const instructions = page.locator(
			".instructions[aria-label='Usage instructions']",
		);
		await expect(instructions).toBeVisible();

		// Test with focus-required shortcuts
		await svgContainer.focus();
		const svgContent = page.getByLabel("SVG content");
		const initialTransform = await svgContent.getAttribute("style");

		// Test Shift+Arrow for pan
		await page.keyboard.press("Shift+ArrowRight");
		await page.keyboard.press("Shift+ArrowDown");
		await page.waitForTimeout(100);

		const panTransform = await svgContent.getAttribute("style");
		expect(panTransform).not.toBe(initialTransform);
		expect(panTransform).toContain("translate");
	});

	test("should have proper focus indicators", async ({ page }) => {
		// Focus control buttons and check for focus indicators
		const zoomInBtn = page.getByLabel("Zoom in, keyboard shortcut plus key");
		await zoomInBtn.focus();

		// Should have visible focus outline
		await expect(zoomInBtn).toHaveCSS("outline-color", "rgb(37, 99, 235)"); // #2563eb
		await expect(zoomInBtn).toHaveCSS("outline-width", "2px");

		// Focus SVG container
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await svgContainer.focus();

		// Should have visible box shadow focus indicator
		const boxShadow = await svgContainer.evaluate(
			el => window.getComputedStyle(el).boxShadow,
		);
		expect(boxShadow).toContain("rgb(37, 99, 235)"); // #2563eb

		// Test another button has focus indicators
		const zoomOutBtn = page.getByLabel(
			"Zoom out, keyboard shortcut minus key",
		);
		await zoomOutBtn.focus();
		await expect(zoomOutBtn).toBeFocused();
		await expect(zoomOutBtn).toHaveCSS("outline-width", "2px");
	});

	test("should handle toast notifications accessibility", async ({ page }) => {
		const copyBtn = page.getByLabel(
			"Copy SVG to clipboard, keyboard shortcut C key",
		);

		// Mock clipboard
		await page.evaluate(() => {
			Object.defineProperty(navigator, "clipboard", {
				value: { writeText: () => Promise.resolve() },
				configurable: true,
				writable: true,
			});
		});

		// Trigger action that shows toast
		await copyBtn.click();
		await page.waitForTimeout(100);

		// Toast should have proper ARIA role
		const toast = page.locator(".toast").first();
		await expect(toast).toBeVisible();
		await expect(toast).toHaveAttribute("role", "alert");

		// Toast close button should be keyboard accessible
		const closeButton = toast.locator(".toast-close");
		await expect(closeButton).toHaveAttribute("tabindex", "0");

		// Should be closeable with keyboard
		await closeButton.focus();
		await page.keyboard.press("Enter");
		await page.waitForTimeout(100);
		await expect(toast).not.toBeVisible();
	});

	test("should support touch interactions on mobile", async ({
		page,
		isMobile,
	}) => {
		if (isMobile) {
			const svgContainer = page.getByLabel("Interactive SVG viewer");
			const svgContent = page.getByLabel("SVG content");

			// Get initial transform
			const initialTransform = await svgContent.getAttribute("style");

			// Simulate single finger pan
			await svgContainer.dispatchEvent("touchstart", {
				touches: [{ clientX: 100, clientY: 100 }],
			});

			await svgContainer.dispatchEvent("touchmove", {
				touches: [{ clientX: 150, clientY: 130 }],
			});

			await svgContainer.dispatchEvent("touchend", { touches: [] });

			await page.waitForTimeout(100);

			// Transform should change due to pan
			const newTransform = await svgContent.getAttribute("style");
			expect(newTransform).not.toBe(initialTransform);
			expect(newTransform).toContain("translate");
		}
	});
});
