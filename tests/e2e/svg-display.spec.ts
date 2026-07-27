/**
 * Playwright tests for SvgDisplay component
 *
 * Tests SVG rendering, zoom/pan functionality, export features,
 * and interactive controls using standard sample projects.
 *
 * Note on pan: the viewer's pan origin is NaN on load (see the "viewer pan
 * origin" test), so any test that exercises panning first clicks "Reset view" to
 * establish a defined origin. That is a real user action, not a workaround for a
 * flaky test.
 */

import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixtures";
import { uploadProject } from "./upload";
import {
	dragViewer,
	errorMessage,
	fileListRegion,
	getViewerState,
	getZoomPercent,
	mainViewerPane,
	svgDoc,
	viewer,
	viewerContent,
	viewerToolbar,
} from "./helpers";

const zoomInButton = (page: Page) =>
	page.getByLabel("Zoom in, keyboard shortcut plus key");
const zoomOutButton = (page: Page) =>
	page.getByLabel("Zoom out, keyboard shortcut minus key");
const resetButton = (page: Page) =>
	page.getByLabel("Reset view, keyboard shortcut zero key");
const copyButton = (page: Page) =>
	page.getByLabel("Copy SVG to clipboard, keyboard shortcut C key");
const downloadButton = (page: Page) =>
	page.getByLabel("Download SVG file, keyboard shortcut S key");
const toggleViewButton = (page: Page) =>
	page.getByLabel(
		"Toggle between preview and code view, keyboard shortcut V key",
	);
const helpButton = (page: Page) =>
	page.getByLabel(
		"Toggle usage instructions, keyboard shortcut question mark key",
	);
const rawSvgRegion = (page: Page) =>
	page.getByRole("region", { name: "The raw SVG code" });
const instructionsRegion = (page: Page) =>
	page.getByRole("region", { name: "Usage instructions" });

/** Reset the viewer and confirm it reached the documented origin. */
async function resetViewer(page: Page, pane: Locator) {
	await resetButton(page).click();
	await expect
		.poll(async () => await getViewerState(pane))
		.toEqual({ scale: 1, panX: 0, panY: 0 });
}

// =============================================================================
// Basic SvgDisplay Tests
// =============================================================================

test.describe("SvgDisplay Component", () => {
	test("should not display a viewer before anything is uploaded", async ({
		page,
	}) => {
		// The right-hand pane exists from the start, but holds the intro copy
		// rather than a viewer until an SVG has been generated.
		await expect(mainViewerPane(page)).toBeVisible();
		await expect(viewer(mainViewerPane(page))).toHaveCount(0);
		await expect(viewerToolbar(page)).toHaveCount(0);
	});

	test("should display SVG when provided", async ({ page, browserName }) => {
		await uploadProject(browserName, page, "simpleJson");

		const pane = mainViewerPane(page);
		await expect(viewer(pane)).toBeVisible();

		const svgElement = svgDoc(pane).locator("svg");
		await expect(svgElement).toHaveAttribute("viewBox", "0 0 100 100");

		// simpleJson has a single blue rect
		const rect = svgElement.locator("rect");
		await expect(rect).toHaveCount(1);
		await expect(rect).toHaveAttribute("fill", "blue");
	});

	test("should display complex SVG with multiple elements", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, "folderWithAssets");

		const pane = mainViewerPane(page);
		const svgElement = svgDoc(pane).locator("svg");
		await expect(svgElement).toHaveAttribute("viewBox", "0 0 200 200");

		await expect(svgElement.locator("image")).toHaveAttribute(
			"href",
			/^data:image\/png;base64,/,
		);
		await expect(svgElement.locator("text")).toContainText("Hello World");
	});
});

// =============================================================================
// SVG Controls Tests
// =============================================================================

test.describe("SVG Controls", () => {
	test.beforeEach(async ({ page, browserName }) => {
		await uploadProject(browserName, page, "simpleJson");
		await expect(viewer(mainViewerPane(page))).toBeVisible();
	});

	test("should display control buttons", async ({ page }) => {
		await expect(zoomInButton(page)).toBeVisible();
		await expect(zoomOutButton(page)).toBeVisible();
		await expect(resetButton(page)).toBeVisible();
		await expect(downloadButton(page)).toBeVisible();
		await expect(copyButton(page)).toBeVisible();
		await expect(toggleViewButton(page)).toBeVisible();
		await expect(helpButton(page)).toBeVisible();

		// Check button titles
		await expect(zoomInButton(page)).toHaveAttribute(
			"title",
			"Zoom In (Keyboard: +)",
		);
		await expect(zoomOutButton(page)).toHaveAttribute(
			"title",
			"Zoom Out (Keyboard: -)",
		);
		await expect(resetButton(page)).toHaveAttribute(
			"title",
			"Reset View (Keyboard: 0)",
		);
		await expect(downloadButton(page)).toHaveAttribute(
			"title",
			"Download SVG (Keyboard: S)",
		);
	});

	test("should handle zoom in action", async ({ page }) => {
		const pane = mainViewerPane(page);
		expect(await getZoomPercent(page)).toBe(100);

		await zoomInButton(page).click();

		await expect
			.poll(async () => (await getViewerState(pane)).scale)
			.toBeCloseTo(1.2, 5);
		expect(await getZoomPercent(page)).toBe(120);
	});

	test("should handle zoom out action", async ({ page }) => {
		const pane = mainViewerPane(page);
		expect(await getZoomPercent(page)).toBe(100);

		await zoomOutButton(page).click();

		await expect
			.poll(async () => (await getViewerState(pane)).scale)
			.toBeCloseTo(1 / 1.2, 5);
		expect(await getZoomPercent(page)).toBe(83); // 100% / 1.2
	});

	test("should handle reset view action", async ({ page }) => {
		const pane = mainViewerPane(page);

		await zoomInButton(page).click();
		await zoomInButton(page).click();
		await expect.poll(() => getZoomPercent(page)).toBe(144); // 1.2 * 1.2

		await resetButton(page).click();

		await expect
			.poll(async () => await getViewerState(pane))
			.toEqual({ scale: 1, panX: 0, panY: 0 });
		expect(await getZoomPercent(page)).toBe(100);
	});

	test("should handle export action and show toast", async ({ page }) => {
		const downloadPromise = page.waitForEvent("download");
		await downloadButton(page).click();

		// The download is real, not just a toast
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toBe("collagen-output.svg");

		const toast = page.getByRole("alert");
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

		await copyButton(page).click();

		const clipboardData = await page.evaluate(
			async () => await navigator.clipboard.readText(),
		);
		expect(clipboardData).toContain("<svg");
		expect(clipboardData).toContain('viewBox="0 0 100 100"');

		await expect(page.getByRole("alert")).toContainText(
			"SVG copied to clipboard",
		);
	});

	test("should handle clipboard copy error", async ({ page }) => {
		// Replacing `navigator.clipboard` is the only way to make the write fail
		// on demand; permissions cannot be revoked mid-test in a way that produces
		// a rejection. Everything downstream — the catch handler, the toast, its
		// error styling — is the component's real behaviour.
		await page.evaluate(() => {
			Object.defineProperty(navigator, "clipboard", {
				value: {
					writeText: () =>
						Promise.reject(new Error("Clipboard access denied")),
				},
				configurable: true,
				writable: true,
			});
		});

		await copyButton(page).click();

		const toast = page.getByRole("alert");
		await expect(toast).toContainText("Failed to copy SVG to clipboard");
		await expect(toast).toHaveClass(/toast-error/);
	});

	test("should toggle code view", async ({ page }) => {
		const pane = mainViewerPane(page);
		await expect(viewer(pane)).toBeVisible();

		await toggleViewButton(page).click();

		// Raw view replaces the interactive viewer and shows the real markup
		await expect(rawSvgRegion(page)).toBeVisible();
		await expect(rawSvgRegion(page).locator("code")).toContainText("<svg");
		await expect(rawSvgRegion(page).locator("code")).toContainText(
			'viewBox="0 0 100 100"',
		);
		await expect(viewer(pane)).toHaveCount(0);

		await toggleViewButton(page).click();

		await expect(viewer(pane)).toBeVisible();
		await expect(rawSvgRegion(page)).toHaveCount(0);
	});

	test("should toggle usage instructions", async ({ page }) => {
		await expect(instructionsRegion(page)).toHaveCount(0);

		await helpButton(page).click();

		await expect(instructionsRegion(page)).toBeVisible();
		await expect(instructionsRegion(page)).toContainText("Zoom");
		await expect(instructionsRegion(page)).toContainText("Pan");

		await helpButton(page).click();
		await expect(instructionsRegion(page)).toHaveCount(0);
	});
});

// =============================================================================
// Interactive Features Tests
// =============================================================================

test.describe("Interactive Features", () => {
	test.beforeEach(async ({ page, browserName }) => {
		await uploadProject(browserName, page, "folderWithAssets");
		await expect(fileListRegion(page)).toBeVisible();
		await expect(viewer(mainViewerPane(page))).toBeVisible();
	});

	test("viewer pan origin is a real number on load", async ({ page }) => {
		// Regression guard for a live defect. `+page.svelte` binds one set of
		// `svgPanX` / `svgPanY` / `svgPrevContainerDimensions` state to BOTH the
		// main viewer and the sidebar's compact viewer, and the compact one is
		// `display: none` (so 0x0). ViewerCore's container-resize effect then
		// evaluates `(panX - prev.width / 2) * (currentWidth / prev.width)` with
		// `prev.width === 0`, i.e. `0 * Infinity` => NaN.
		//
		// Consequence for users: `transform: translate(NaNpx, NaNpx)` is invalid,
		// so the whole transform is dropped, and because `panX += dx` keeps NaN,
		// dragging and Shift+arrow panning do nothing at all until the user
		// happens to press "Reset view".
		const { panX, panY } = await getViewerState(mainViewerPane(page));
		expect(panX).not.toBeNaN();
		expect(panY).not.toBeNaN();
	});

	test("should handle mouse pan interaction", async ({ page }) => {
		const pane = mainViewerPane(page);
		await resetViewer(page, pane);

		await dragViewer(page, pane, 100, 50);

		const { panX, panY, scale } = await getViewerState(pane);
		expect(panX).toBeCloseTo(100, 0);
		expect(panY).toBeCloseTo(50, 0);
		expect(scale).toBe(1);

		// The pan variables really do drive the rendered transform
		const transform = await viewerContent(pane).evaluate(
			el => getComputedStyle(el.querySelector(".viewer-media")!).transform,
		);
		expect(transform).toMatch(/matrix\(1,\s*0,\s*0,\s*1,\s*100,\s*50\)/);
	});

	test("should pan when the drag starts over the rendered SVG", async ({
		page,
	}) => {
		const pane = mainViewerPane(page);
		await resetViewer(page, pane);

		// The SVG lives in an iframe; start the drag over its centre to prove the
		// iframe does not swallow the gesture.
		const frameBox = await pane
			.locator('iframe[title="Generated SVG"]')
			.boundingBox();
		expect(frameBox).not.toBeNull();
		const centerX = frameBox!.x + frameBox!.width / 2;
		const centerY = frameBox!.y + frameBox!.height / 2;

		await page.mouse.move(centerX, centerY);
		await page.mouse.down();
		await page.mouse.move(centerX + 100, centerY + 50, { steps: 8 });
		await page.mouse.up();

		const { panX, panY } = await getViewerState(pane);
		expect(panX).toBeCloseTo(100, 0);
		expect(panY).toBeCloseTo(50, 0);
	});

	test("should handle wheel zoom with Ctrl key", async ({ page }) => {
		const pane = mainViewerPane(page);
		expect(await getZoomPercent(page)).toBe(100);

		await viewer(pane).hover();
		await page.keyboard.down("Control");
		await page.mouse.wheel(0, -100); // Zoom in
		await page.keyboard.up("Control");

		await expect
			.poll(async () => (await getViewerState(pane)).scale)
			.toBeGreaterThan(1);
		expect(await getZoomPercent(page)).toBeGreaterThan(100);
	});

	test("should not zoom without Ctrl key", async ({ page }) => {
		const pane = mainViewerPane(page);
		const before = await getViewerState(pane);
		expect(before.scale).toBe(1);

		await viewer(pane).hover();
		await page.mouse.wheel(0, -100);

		// Give any (incorrect) handler a chance to run before asserting no change
		await page.waitForTimeout(150);
		expect((await getViewerState(pane)).scale).toBe(1);
		expect(await getZoomPercent(page)).toBe(100);
	});

	test("should change cursor during pan", async ({ page }) => {
		const svgViewer = viewer(mainViewerPane(page));

		await expect(svgViewer).toHaveCSS("cursor", "grab");

		await svgViewer.hover();
		await page.mouse.down();
		await expect(svgViewer).toHaveCSS("cursor", "grabbing");

		await page.mouse.up();
		await expect(svgViewer).toHaveCSS("cursor", "grab");
	});

	test("zoom and view shortcuts work without focusing the viewer", async ({
		page,
	}) => {
		const pane = mainViewerPane(page);
		expect(await getZoomPercent(page)).toBe(100);

		await page.keyboard.press("Equal");
		await expect.poll(() => getZoomPercent(page)).toBe(120);

		await page.keyboard.press("Minus");
		await expect.poll(() => getZoomPercent(page)).toBe(100);

		await page.keyboard.press("Minus");
		await expect.poll(() => getZoomPercent(page)).toBe(83);

		await page.keyboard.press("0");
		await expect
			.poll(async () => await getViewerState(pane))
			.toEqual({ scale: 1, panX: 0, panY: 0 });

		// View toggle is also global
		await page.keyboard.press("v");
		await expect(rawSvgRegion(page)).toBeVisible();

		await page.keyboard.press("v");
		await expect(viewer(pane)).toBeVisible();
	});

	test("should handle focus-required pan shortcuts", async ({ page }) => {
		const pane = mainViewerPane(page);
		await resetViewer(page, pane);

		const svgViewer = viewer(pane);
		await svgViewer.focus();
		await expect(svgViewer).toBeFocused();

		// PAN_AMOUNT is 20px; right/down pan negatively
		await page.keyboard.press("Shift+ArrowRight");
		await page.keyboard.press("Shift+ArrowDown");

		await expect
			.poll(async () => await getViewerState(pane))
			.toEqual({ scale: 1, panX: -20, panY: -20 });
	});

	test("should not pan without focus", async ({ page }) => {
		const pane = mainViewerPane(page);
		await resetViewer(page, pane);

		// Move focus off the viewer
		await zoomInButton(page).focus();
		await resetButton(page).click();
		await expect(viewer(pane)).not.toBeFocused();

		await page.keyboard.press("Shift+ArrowRight");
		await page.keyboard.press("Shift+ArrowDown");

		await page.waitForTimeout(150);
		expect(await getViewerState(pane)).toEqual({
			scale: 1,
			panX: 0,
			panY: 0,
		});
	});

	test("should cycle the background style with the B key", async ({
		page,
	}) => {
		const container = viewer(mainViewerPane(page));
		await expect(container).toHaveClass(/bg-light-checkerboard/);

		await page.keyboard.press("b");
		await expect(container).toHaveClass(/bg-dark-checkerboard/);

		await page.keyboard.press("b");
		await expect(container).toHaveClass(/bg-solid-dark/);

		await page.keyboard.press("b");
		await expect(container).toHaveClass(/bg-solid-light/);
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
		await uploadProject(browserName, page, "multipleFilesValid");

		const pane = mainViewerPane(page);
		const svgElement = svgDoc(pane).locator("svg");
		await expect(svgElement).toHaveAttribute("viewBox", "0 0 150 150");

		const circle = svgElement.locator("circle");
		await expect(circle).toHaveAttribute("fill", "purple");

		// Non-manifest files are carried along without disturbing the render
		await expect(fileListRegion(page).getByText("data.txt")).toBeVisible();
		await expect(fileListRegion(page).getByText("config.json")).toBeVisible();

		// Interactive controls should still work
		await zoomInButton(page).click();
		await expect.poll(() => getZoomPercent(page)).toBe(120);
	});

	test("should handle malformed content gracefully", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, "malformedJson");

		const pane = mainViewerPane(page);
		await expect(errorMessage(pane)).toBeVisible();
		await expect(errorMessage(pane)).toContainText(
			/error|invalid|json|parse/i,
		);

		// No viewer is rendered while the manifest is broken
		await expect(viewer(pane)).toHaveCount(0);
	});

	test("should report a missing manifest", async ({ page, browserName }) => {
		await uploadProject(browserName, page, "noManifest");

		const pane = mainViewerPane(page);
		await expect(errorMessage(pane)).toBeVisible();
		await expect(errorMessage(pane)).toContainText(/manifest/i);
		await expect(viewer(pane)).toHaveCount(0);
	});

	test("should handle projects with different viewBox dimensions", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, "folderWithAssets");

		const pane = mainViewerPane(page);
		await expect(svgDoc(pane).locator("svg")).toHaveAttribute(
			"viewBox",
			"0 0 200 200",
		);

		await zoomInButton(page).click();
		await expect.poll(() => getZoomPercent(page)).toBe(120);

		// Pan works the same regardless of viewBox size
		await resetViewer(page, pane);
		await dragViewer(page, pane, 50, 30);
		const { panX, panY } = await getViewerState(pane);
		expect(panX).toBeCloseTo(50, 0);
		expect(panY).toBeCloseTo(30, 0);
	});

	test("should handle rapid interactions without breaking state", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, "simpleJson");
		await expect(viewer(mainViewerPane(page))).toBeVisible();

		// Rapid clicking should not break state
		await zoomInButton(page).click();
		await zoomInButton(page).click();
		await zoomOutButton(page).click();
		await zoomInButton(page).click();
		await resetButton(page).click();

		await expect.poll(() => getZoomPercent(page)).toBe(100);

		// Controls should still be responsive
		await zoomInButton(page).click();
		await expect.poll(() => getZoomPercent(page)).toBe(120);
	});

	test("should maintain state after toggling between views", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, "simpleJson");
		const pane = mainViewerPane(page);
		await expect(viewer(pane)).toBeVisible();

		await zoomInButton(page).click();
		await zoomInButton(page).click();
		await expect.poll(() => getZoomPercent(page)).toBe(144);

		await toggleViewButton(page).click();
		await expect(rawSvgRegion(page)).toBeVisible();

		await toggleViewButton(page).click();

		// Zoom level survives the round trip
		await expect(viewer(pane)).toBeVisible();
		expect(await getZoomPercent(page)).toBe(144);
		expect((await getViewerState(pane)).scale).toBeCloseTo(1.44, 5);
	});
});

// =============================================================================
// Responsive and Accessibility Tests
// =============================================================================

test.describe("Responsive and Accessibility", () => {
	test.beforeEach(async ({ page, browserName }) => {
		await uploadProject(browserName, page, "simpleJson");
		await expect(viewer(mainViewerPane(page))).toBeVisible();
	});

	test("should be responsive on different screen sizes", async ({ page }) => {
		const pane = mainViewerPane(page);
		const svgElement = svgDoc(pane).locator("svg");

		for (const size of [
			{ width: 1200, height: 800 },
			{ width: 768, height: 1024 },
			{ width: 375, height: 667 },
		]) {
			await page.setViewportSize(size);
			await expect(viewer(pane)).toBeVisible();
			await expect(svgElement).toBeVisible();

			// The viewer must never overflow the viewport it is rendered in
			const box = await viewer(pane).boundingBox();
			expect(box).not.toBeNull();
			expect(box!.width).toBeLessThanOrEqual(size.width);
		}
	});

	test("should have proper ARIA labels and descriptions", async ({ page }) => {
		for (const control of [
			zoomInButton(page),
			zoomOutButton(page),
			resetButton(page),
			downloadButton(page),
			copyButton(page),
			toggleViewButton(page),
			helpButton(page),
		]) {
			await expect(control).toBeVisible();
		}

		const pane = mainViewerPane(page);
		const svgViewer = viewer(pane);
		await expect(svgViewer).toHaveAttribute(
			"aria-describedby",
			"viewer-controls-description",
		);

		// The transformable content is exposed as an image to assistive tech
		await expect(viewerContent(pane)).toHaveAttribute("role", "img");

		await expect(viewerToolbar(page)).toBeVisible();

		// Hidden description backing aria-describedby. Scoped to the pane because
		// the compact viewer renders a second element with the same id — a
		// duplicate-id defect in the app, but not what this test is about.
		const description = pane.locator("#viewer-controls-description");
		await expect(description).toBeAttached();
		await expect(description).toContainText("Keyboard controls");
	});

	test("should be keyboard accessible with focusable elements", async ({
		page,
	}) => {
		for (const control of [
			zoomInButton(page),
			zoomOutButton(page),
			resetButton(page),
			copyButton(page),
			downloadButton(page),
		]) {
			await control.focus();
			await expect(control).toBeFocused();
		}

		const svgViewer = viewer(mainViewerPane(page));
		await svgViewer.focus();
		await expect(svgViewer).toBeFocused();
		await expect(svgViewer).toHaveAttribute("tabindex", "0");
	});

	test("should support Enter key activation on buttons", async ({ page }) => {
		await zoomInButton(page).focus();
		expect(await getZoomPercent(page)).toBe(100);

		await page.keyboard.press("Enter");

		await expect.poll(() => getZoomPercent(page)).toBe(120);
	});

	test("should support Space key activation on buttons", async ({ page }) => {
		await zoomOutButton(page).focus();
		expect(await getZoomPercent(page)).toBe(100);

		await page.keyboard.press(" ");

		await expect.poll(() => getZoomPercent(page)).toBe(83);
	});

	test("should support all documented keyboard shortcuts", async ({
		page,
	}) => {
		const pane = mainViewerPane(page);
		expect(await getZoomPercent(page)).toBe(100);

		await page.keyboard.press("+");
		await expect.poll(() => getZoomPercent(page)).toBe(120);

		await page.keyboard.press("=");
		await expect.poll(() => getZoomPercent(page)).toBe(144);

		await page.keyboard.press("-");
		await expect.poll(() => getZoomPercent(page)).toBe(120);

		await page.keyboard.press("0");
		await expect.poll(() => getZoomPercent(page)).toBe(100);

		// View toggle, both cases
		await page.keyboard.press("v");
		await expect(rawSvgRegion(page)).toBeVisible();
		await page.keyboard.press("V");
		await expect(viewer(pane)).toBeVisible();

		// Help toggle
		await page.keyboard.press("?");
		await expect(instructionsRegion(page)).toBeVisible();
		await page.keyboard.press("?");
		await expect(instructionsRegion(page)).toHaveCount(0);

		// Focus-required pan
		await viewer(pane).focus();
		await page.keyboard.press("Shift+ArrowRight");
		await page.keyboard.press("Shift+ArrowDown");
		await expect
			.poll(async () => await getViewerState(pane))
			.toEqual({ scale: 1, panX: -20, panY: -20 });
	});

	test("should have proper focus indicators", async ({ page }) => {
		await zoomInButton(page).focus();
		await expect(zoomInButton(page)).toHaveCSS(
			"outline-color",
			"rgb(37, 99, 235)",
		);
		await expect(zoomInButton(page)).toHaveCSS("outline-width", "2px");

		// The viewer shows focus via a border on its inner mask
		const pane = mainViewerPane(page);
		await viewer(pane).focus();
		const mask = pane.locator(".viewer-content-mask");
		await expect(mask).toHaveCSS("border-top-color", "rgb(37, 99, 235)");
		await expect(mask).toHaveCSS("border-top-width", "2px");

		await zoomOutButton(page).focus();
		await expect(zoomOutButton(page)).toHaveCSS("outline-width", "2px");
	});

	test("should handle toast notifications accessibility", async ({ page }) => {
		// Stub only the clipboard write, so the toast comes from the real code path
		await page.evaluate(() => {
			Object.defineProperty(navigator, "clipboard", {
				value: { writeText: () => Promise.resolve() },
				configurable: true,
				writable: true,
			});
		});

		await copyButton(page).click();

		const toast = page.getByRole("alert");
		await expect(toast).toBeVisible();

		// Toast close button should be keyboard accessible
		const closeButton = toast.locator(".toast-close");
		await expect(closeButton).toHaveAttribute("tabindex", "0");

		await closeButton.focus();
		await page.keyboard.press("Enter");
		await expect(toast).toHaveCount(0);
	});
});

// =============================================================================
// Touch Interaction Tests
// =============================================================================

test.describe("Touch Interactions", () => {
	test.skip(
		({ browserName }) => browserName === "firefox",
		"Firefox does not support touch emulation in Playwright",
	);

	test("single-finger drag pans the viewer", async ({
		browser,
		browserName,
	}) => {
		const context = await browser.newContext({
			hasTouch: true,
			isMobile: true,
			viewport: { width: 390, height: 780 },
		});
		const page = await context.newPage();

		try {
			await page.goto("/");
			await page.waitForFunction(() => window.appMounted === true, {
				timeout: 10000,
			});
			await uploadProject(browserName, page, "simpleJson");

			const pane = mainViewerPane(page);
			await expect(viewer(pane)).toBeVisible();
			await resetViewer(page, pane);

			// Playwright's touchscreen API only exposes `tap`, so a drag has to be
			// built from real TouchEvents in-page. The events are genuine DOM
			// events with genuine Touch objects; only the human finger is missing.
			await viewer(pane).evaluate(el => {
				const makeTouch = (x: number, y: number) =>
					new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
				const fire = (type: string, touches: Touch[]) =>
					el.dispatchEvent(
						new TouchEvent(type, {
							bubbles: true,
							cancelable: true,
							touches,
							targetTouches: touches,
							changedTouches: touches,
						}),
					);
				fire("touchstart", [makeTouch(100, 100)]);
				fire("touchmove", [makeTouch(150, 130)]);
				fire("touchend", []);
			});

			await expect
				.poll(async () => await getViewerState(pane))
				.toEqual({ scale: 1, panX: 50, panY: 30 });
		} finally {
			await context.close();
		}
	});
});
