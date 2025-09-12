/**
 * Playwright tests for keyboard zoom functionality in SvgDisplay component
 *
 * Tests verify the specific keyboard event handling modifications around lines 298-323 in SvgDisplay.svelte:
 * - Plain +/- keys should still zoom the SVG viewer (existing functionality)
 * - Cmd/Meta + Plus/Minus keys should pass through to browser for page zoom (new functionality)
 * - Ctrl + Plus/Minus keys should pass through to browser for page zoom (Windows/Linux support)
 * - Alt + Plus/Minus keys should not interfere with browser zoom
 */

import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { uploadProject } from "./upload";

test.describe("Keyboard Zoom Behavior", () => {
	test.beforeEach(async ({ page, browserName }) => {
		// Upload a simple project to test keyboard zoom functionality
		await uploadProject(browserName, page, "simpleJson");

		// Verify SVG viewer loads successfully
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await expect(svgContainer).toBeVisible();

		// Verify initial zoom is 100%
		const zoomLevel = page.locator(".zoom-level");
		await expect(zoomLevel).toContainText("100%");
	});

	// =============================================================================
	// Plain +/- Keys (Existing Functionality - Should Still Work)
	// =============================================================================

	test("should zoom in with plain + key (existing functionality preserved)", async ({
		page,
	}) => {
		const svgContent = page.getByLabel("SVG content");
		const zoomLevel = page.locator(".zoom-level");

		// Get initial transform
		const initialTransform = await svgContent.getAttribute("style");

		// Press plain + key (no modifiers)
		await page.keyboard.press("+");
		await page.waitForTimeout(100);

		// Verify zoom increased to 120%
		await expect(zoomLevel).toContainText("120%");

		// Verify transform changed
		const newTransform = await svgContent.getAttribute("style");
		expect(newTransform).not.toBe(initialTransform);
		expect(newTransform).toContain("--scale");
	});

	test("should zoom in with plain = key (existing functionality preserved)", async ({
		page,
	}) => {
		const svgContent = page.getByLabel("SVG content");
		const zoomLevel = page.locator(".zoom-level");

		// Get initial transform
		const initialTransform = await svgContent.getAttribute("style");

		// Press plain = key (no modifiers) - this is the "+" key without shift
		await page.keyboard.press("=");
		await page.waitForTimeout(100);

		// Verify zoom increased to 120%
		await expect(zoomLevel).toContainText("120%");

		// Verify transform changed
		const newTransform = await svgContent.getAttribute("style");
		expect(newTransform).not.toBe(initialTransform);
		expect(newTransform).toContain("--scale");
	});

	test("should zoom out with plain - key (existing functionality preserved)", async ({
		page,
	}) => {
		const svgContent = page.getByLabel("SVG content");
		const zoomLevel = page.locator(".zoom-level");

		// Get initial transform
		const initialTransform = await svgContent.getAttribute("style");

		// Press plain - key (no modifiers)
		await page.keyboard.press("-");
		await page.waitForTimeout(100);

		// Verify zoom decreased to 83% (100% / 1.2 ≈ 83%)
		await expect(zoomLevel).toContainText("83%");

		// Verify transform changed
		const newTransform = await svgContent.getAttribute("style");
		expect(newTransform).not.toBe(initialTransform);
		expect(newTransform).toContain("--scale");
	});

	test("should zoom out with plain _ key (existing functionality preserved)", async ({
		page,
	}) => {
		const svgContent = page.getByLabel("SVG content");
		const zoomLevel = page.locator(".zoom-level");

		// Get initial transform
		const initialTransform = await svgContent.getAttribute("style");

		// Press plain _ key (no modifiers) - this is the "-" key with shift
		await page.keyboard.press("_");
		await page.waitForTimeout(100);

		// Verify zoom decreased to 83% (100% / 1.2 ≈ 83%)
		await expect(zoomLevel).toContainText("83%");

		// Verify transform changed
		const newTransform = await svgContent.getAttribute("style");
		expect(newTransform).not.toBe(initialTransform);
		expect(newTransform).toContain("--scale");
	});

	// =============================================================================
	// Cmd/Meta + Plus/Minus Keys (New Functionality - Should Pass Through)
	// =============================================================================

	test("should NOT zoom SVG with Cmd/Meta + Plus (allow browser page zoom)", async ({
		page,
	}) => {
		const svgContent = page.getByLabel("SVG content");
		const zoomLevel = page.locator(".zoom-level");

		// Get initial transform
		const initialTransform = await svgContent.getAttribute("style");

		// Press Cmd/Meta + Plus (should pass through to browser)
		await page.keyboard.press("Meta++");
		await page.waitForTimeout(100);

		// Verify SVG zoom level remains unchanged at 100%
		await expect(zoomLevel).toContainText("100%");

		// Verify SVG transform remains unchanged
		const newTransform = await svgContent.getAttribute("style");
		expect(newTransform).toBe(initialTransform);
	});

	test("should NOT zoom SVG with Cmd/Meta + = (allow browser page zoom)", async ({
		page,
	}) => {
		const svgContent = page.getByLabel("SVG content");
		const zoomLevel = page.locator(".zoom-level");

		// Get initial transform
		const initialTransform = await svgContent.getAttribute("style");

		// Press Cmd/Meta + = (should pass through to browser)
		await page.keyboard.press("Meta+=");
		await page.waitForTimeout(100);

		// Verify SVG zoom level remains unchanged at 100%
		await expect(zoomLevel).toContainText("100%");

		// Verify SVG transform remains unchanged
		const newTransform = await svgContent.getAttribute("style");
		expect(newTransform).toBe(initialTransform);
	});

	test("should NOT zoom SVG with Cmd/Meta + Minus (allow browser page zoom)", async ({
		page,
	}) => {
		const svgContent = page.getByLabel("SVG content");
		const zoomLevel = page.locator(".zoom-level");

		// Get initial transform
		const initialTransform = await svgContent.getAttribute("style");

		// Press Cmd/Meta + Minus (should pass through to browser)
		await page.keyboard.press("Meta+-");
		await page.waitForTimeout(100);

		// Verify SVG zoom level remains unchanged at 100%
		await expect(zoomLevel).toContainText("100%");

		// Verify SVG transform remains unchanged
		const newTransform = await svgContent.getAttribute("style");
		expect(newTransform).toBe(initialTransform);
	});

	test("should NOT zoom SVG with Cmd/Meta + _ (allow browser page zoom)", async ({
		page,
	}) => {
		const svgContent = page.getByLabel("SVG content");
		const zoomLevel = page.locator(".zoom-level");

		// Get initial transform
		const initialTransform = await svgContent.getAttribute("style");

		// Press Cmd/Meta + _ (should pass through to browser)
		await page.keyboard.press("Meta+_");
		await page.waitForTimeout(100);

		// Verify SVG zoom level remains unchanged at 100%
		await expect(zoomLevel).toContainText("100%");

		// Verify SVG transform remains unchanged
		const newTransform = await svgContent.getAttribute("style");
		expect(newTransform).toBe(initialTransform);
	});

	// =============================================================================
	// Ctrl + Plus/Minus Keys (Windows/Linux Support - Should Pass Through)
	// =============================================================================

	test("should NOT zoom SVG with Ctrl + Plus (allow browser page zoom)", async ({
		page,
	}) => {
		const svgContent = page.getByLabel("SVG content");
		const zoomLevel = page.locator(".zoom-level");

		// Get initial transform
		const initialTransform = await svgContent.getAttribute("style");

		// Press Ctrl + Plus (should pass through to browser)
		await page.keyboard.press("Control++");
		await page.waitForTimeout(100);

		// Verify SVG zoom level remains unchanged at 100%
		await expect(zoomLevel).toContainText("100%");

		// Verify SVG transform remains unchanged
		const newTransform = await svgContent.getAttribute("style");
		expect(newTransform).toBe(initialTransform);
	});

	test("should NOT zoom SVG with Ctrl + = (allow browser page zoom)", async ({
		page,
	}) => {
		const svgContent = page.getByLabel("SVG content");
		const zoomLevel = page.locator(".zoom-level");

		// Get initial transform
		const initialTransform = await svgContent.getAttribute("style");

		// Press Ctrl + = (should pass through to browser)
		await page.keyboard.press("Control+=");
		await page.waitForTimeout(100);

		// Verify SVG zoom level remains unchanged at 100%
		await expect(zoomLevel).toContainText("100%");

		// Verify SVG transform remains unchanged
		const newTransform = await svgContent.getAttribute("style");
		expect(newTransform).toBe(initialTransform);
	});

	test("should NOT zoom SVG with Ctrl + Minus (allow browser page zoom)", async ({
		page,
	}) => {
		const svgContent = page.getByLabel("SVG content");
		const zoomLevel = page.locator(".zoom-level");

		// Get initial transform
		const initialTransform = await svgContent.getAttribute("style");

		// Press Ctrl + Minus (should pass through to browser)
		await page.keyboard.press("Control+-");
		await page.waitForTimeout(100);

		// Verify SVG zoom level remains unchanged at 100%
		await expect(zoomLevel).toContainText("100%");

		// Verify SVG transform remains unchanged
		const newTransform = await svgContent.getAttribute("style");
		expect(newTransform).toBe(initialTransform);
	});

	test("should NOT zoom SVG with Ctrl + _ (allow browser page zoom)", async ({
		page,
	}) => {
		const svgContent = page.getByLabel("SVG content");
		const zoomLevel = page.locator(".zoom-level");

		// Get initial transform
		const initialTransform = await svgContent.getAttribute("style");

		// Press Ctrl + _ (should pass through to browser)
		await page.keyboard.press("Control+_");
		await page.waitForTimeout(100);

		// Verify SVG zoom level remains unchanged at 100%
		await expect(zoomLevel).toContainText("100%");

		// Verify SVG transform remains unchanged
		const newTransform = await svgContent.getAttribute("style");
		expect(newTransform).toBe(initialTransform);
	});

	// =============================================================================
	// Alt + Plus/Minus Keys (Should Not Interfere With Browser Zoom)
	// =============================================================================

	test("should NOT zoom SVG with Alt + Plus (allow browser to handle)", async ({
		page,
	}) => {
		const svgContent = page.getByLabel("SVG content");
		const zoomLevel = page.locator(".zoom-level");

		// Get initial transform
		const initialTransform = await svgContent.getAttribute("style");

		// Press Alt + Plus (should pass through to browser)
		await page.keyboard.press("Alt++");
		await page.waitForTimeout(100);

		// Verify SVG zoom level remains unchanged at 100%
		await expect(zoomLevel).toContainText("100%");

		// Verify SVG transform remains unchanged
		const newTransform = await svgContent.getAttribute("style");
		expect(newTransform).toBe(initialTransform);
	});

	test("should NOT zoom SVG with Alt + = (allow browser to handle)", async ({
		page,
	}) => {
		const svgContent = page.getByLabel("SVG content");
		const zoomLevel = page.locator(".zoom-level");

		// Get initial transform
		const initialTransform = await svgContent.getAttribute("style");

		// Press Alt + = (should pass through to browser)
		await page.keyboard.press("Alt+=");
		await page.waitForTimeout(100);

		// Verify SVG zoom level remains unchanged at 100%
		await expect(zoomLevel).toContainText("100%");

		// Verify SVG transform remains unchanged
		const newTransform = await svgContent.getAttribute("style");
		expect(newTransform).toBe(initialTransform);
	});

	test("should NOT zoom SVG with Alt + Minus (allow browser to handle)", async ({
		page,
	}) => {
		const svgContent = page.getByLabel("SVG content");
		const zoomLevel = page.locator(".zoom-level");

		// Get initial transform
		const initialTransform = await svgContent.getAttribute("style");

		// Press Alt + Minus (should pass through to browser)
		await page.keyboard.press("Alt+-");
		await page.waitForTimeout(100);

		// Verify SVG zoom level remains unchanged at 100%
		await expect(zoomLevel).toContainText("100%");

		// Verify SVG transform remains unchanged
		const newTransform = await svgContent.getAttribute("style");
		expect(newTransform).toBe(initialTransform);
	});

	test("should NOT zoom SVG with Alt + _ (allow browser to handle)", async ({
		page,
	}) => {
		const svgContent = page.getByLabel("SVG content");
		const zoomLevel = page.locator(".zoom-level");

		// Get initial transform
		const initialTransform = await svgContent.getAttribute("style");

		// Press Alt + _ (should pass through to browser)
		await page.keyboard.press("Alt+_");
		await page.waitForTimeout(100);

		// Verify SVG zoom level remains unchanged at 100%
		await expect(zoomLevel).toContainText("100%");

		// Verify SVG transform remains unchanged
		const newTransform = await svgContent.getAttribute("style");
		expect(newTransform).toBe(initialTransform);
	});

	// =============================================================================
	// Mixed Scenarios and Edge Cases
	// =============================================================================

	test("should handle mixed plain and modified key combinations correctly", async ({
		page,
	}) => {
		const svgContent = page.getByLabel("SVG content");
		const zoomLevel = page.locator(".zoom-level");

		// Start at 100%
		await expect(zoomLevel).toContainText("100%");

		// Plain + should zoom in to 120%
		await page.keyboard.press("+");
		await page.waitForTimeout(100);
		await expect(zoomLevel).toContainText("120%");

		// Ctrl + - should NOT zoom (pass through to browser)
		const transformAfterPlainZoom = await svgContent.getAttribute("style");
		await page.keyboard.press("Control+-");
		await page.waitForTimeout(100);
		await expect(zoomLevel).toContainText("120%"); // Should remain unchanged
		const transformAfterCtrlMinus = await svgContent.getAttribute("style");
		expect(transformAfterCtrlMinus).toBe(transformAfterPlainZoom);

		// Plain - should zoom out to 100%
		await page.keyboard.press("-");
		await page.waitForTimeout(100);
		await expect(zoomLevel).toContainText("100%");

		// Meta + = should NOT zoom (pass through to browser)
		const transformAfterPlainZoomOut = await svgContent.getAttribute("style");
		await page.keyboard.press("Meta+=");
		await page.waitForTimeout(100);
		await expect(zoomLevel).toContainText("100%"); // Should remain unchanged
		const transformAfterMetaEquals = await svgContent.getAttribute("style");
		expect(transformAfterMetaEquals).toBe(transformAfterPlainZoomOut);
	});

	test("should preserve keyboard zoom behavior when SVG is focused", async ({
		page,
	}) => {
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		const zoomLevel = page.locator(".zoom-level");

		// Focus the SVG container
		await svgContainer.focus();
		await expect(svgContainer).toBeFocused();

		// Plain keys should still work
		await page.keyboard.press("+");
		await page.waitForTimeout(100);
		await expect(zoomLevel).toContainText("120%");

		// Modified keys should still pass through
		await page.keyboard.press("Ctrl+-");
		await page.waitForTimeout(100);
		await expect(zoomLevel).toContainText("120%"); // Should remain unchanged
	});

	test("should not interfere with keyboard shortcuts when typing in text editor", async ({
		page,
	}) => {
		const zoomLevel = page.locator(".zoom-level");

		// Toggle to code view to potentially show text editor
		await page.keyboard.press("v");
		await page.waitForTimeout(100);

		const rawSvg = page.getByRole("region", { name: /raw svg code/i });
		await expect(rawSvg).toBeVisible();

		// When in code view, keyboard shortcuts should be disabled
		// Test that +/- don't zoom while viewing code
		await page.keyboard.press("+");
		await page.waitForTimeout(100);
		await expect(zoomLevel).toContainText("100%"); // Should remain unchanged

		await page.keyboard.press("-");
		await page.waitForTimeout(100);
		await expect(zoomLevel).toContainText("100%"); // Should remain unchanged

		// Switch back to preview mode
		await page.keyboard.press("v");
		await page.waitForTimeout(100);

		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await expect(svgContainer).toBeVisible();

		// Keyboard shortcuts should work again
		await page.keyboard.press("+");
		await page.waitForTimeout(100);
		await expect(zoomLevel).toContainText("120%");
	});

	test("should handle rapid keyboard combinations without state issues", async ({
		page,
	}) => {
		const zoomLevel = page.locator(".zoom-level");

		// Rapid sequence of plain and modified keys
		await page.keyboard.press("+"); // Should zoom to 120%
		await page.keyboard.press("Control++"); // Should NOT zoom (pass through)
		await page.keyboard.press("-"); // Should zoom to 100%
		await page.keyboard.press("Meta+-"); // Should NOT zoom (pass through)
		await page.keyboard.press("="); // Should zoom to 120%
		await page.keyboard.press("Alt+="); // Should NOT zoom (pass through)

		await page.waitForTimeout(200);

		// Should end up at 120% after the sequence
		await expect(zoomLevel).toContainText("120%");

		// Reset and verify it works
		await page.keyboard.press("0");
		await page.waitForTimeout(100);
		await expect(zoomLevel).toContainText("100%");
	});
});
