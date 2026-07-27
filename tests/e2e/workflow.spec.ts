/**
 * End-to-end workflow tests for complete user journeys
 *
 * Tests complete user workflows from file upload through SVG generation
 * to user interactions. Focuses on realistic scenarios and actual app behavior.
 */

import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { uploadProject } from "./upload";
import {
	compactViewerPane,
	dragViewer,
	errorMessage,
	fileListRegion,
	getEditorText,
	getViewerState,
	mainViewerPane,
	openFileInEditor,
	setEditorText,
	svgDoc,
	viewer,
	viewerToolbar,
} from "./helpers";

// =============================================================================
// Complete Workflow Tests
// =============================================================================

test.describe("Complete User Workflows", () => {
	test("should handle basic upload workflow", async ({
		page,
		browserName,
	}) => {
		// 1. The file list is the upload surface and is present before any upload
		const fileList = fileListRegion(page);
		await expect(fileList).toBeVisible();
		await expect(
			fileList.getByRole("button", { name: /browse for files/i }),
		).toBeVisible();
		await expect(fileList.getByRole("heading", { level: 3 })).toHaveText(
			"Files (0)",
		);

		await uploadProject(browserName, page, "simpleJson");

		// The uploaded file is listed and the SVG is rendered
		await expect(fileList.getByRole("heading", { level: 3 })).toHaveText(
			"Files (1)",
		);
		await expect(fileList.getByText("collagen.json")).toBeVisible();

		const pane = mainViewerPane(page);
		await expect(viewer(pane)).toBeVisible();

		const svgElement = svgDoc(pane).locator("svg");
		await expect(svgElement).toHaveAttribute("viewBox", "0 0 100 100");
		await expect(svgElement.locator("rect")).toHaveAttribute("fill", "blue");

		// Controls are available, and the upload surface remains usable
		await expect(viewerToolbar(page)).toBeVisible();
		await expect(
			fileList.getByRole("button", { name: /browse for files/i }),
		).toBeEnabled();
	});

	test("should handle project with assets", async ({ page, browserName }) => {
		// Upload project with image assets
		await uploadProject(browserName, page, "folderWithAssets");

		await expect(fileListRegion(page)).toBeVisible();
		const pane = mainViewerPane(page);
		await expect(viewer(pane)).toBeVisible();

		// Verify SVG contains embedded image
		const svgElement = svgDoc(pane).locator("svg");
		await expect(svgElement).toHaveAttribute("viewBox", "0 0 200 200");

		// The image asset is embedded rather than referenced
		const imageElement = svgElement.locator("image");
		await expect(imageElement).toHaveAttribute(
			"href",
			/^data:image\/png;base64,/,
		);

		// Check for text element
		await expect(svgElement.locator("text")).toContainText("Hello World");
	});

	test("should handle Jsonnet project", async ({ page, browserName }) => {
		// simpleJsonnet also exercises `import`, so this covers Jsonnet file
		// resolution through the in-memory filesystem, not just compilation.
		await uploadProject(browserName, page, "simpleJsonnet");

		const svgElement = svgDoc(mainViewerPane(page)).locator("svg");
		await expect(svgElement).toHaveAttribute("viewBox", "0 0 100 100");

		const rect = svgElement.locator("rect");
		await expect(rect).toHaveCount(1);
		await expect(rect).toHaveAttribute("fill", "red");
	});

	test("should handle error recovery workflow", async ({
		page,
		browserName,
	}) => {
		// 1. Upload invalid project that will fail
		await uploadProject(browserName, page, "malformedJson");

		const pane = mainViewerPane(page);
		await expect(errorMessage(pane)).toBeVisible();
		await expect(errorMessage(pane)).toContainText(
			/error|invalid|json|parse/i,
		);

		// 2. Upload valid project to recover
		await uploadProject(browserName, page, "folderWithAssets");

		// Error should be cleared and SVG should be displayed
		await expect(viewer(pane)).toBeVisible();
		await expect(errorMessage(pane)).toHaveCount(0);

		// Verify the SVG content is from the successful upload
		await expect(svgDoc(pane).locator("svg text")).toContainText(
			"Hello World",
		);
	});
});

// =============================================================================
// Interactive Workflow Tests
// =============================================================================

test.describe("Interactive Workflows", () => {
	test.beforeEach(async ({ page, browserName }) => {
		// Set up a project for interaction testing
		await uploadProject(browserName, page, "simpleJson");
		await expect(viewer(mainViewerPane(page))).toBeVisible();
	});

	test("should support complete zoom workflow", async ({ page }) => {
		const pane = mainViewerPane(page);
		const zoomInBtn = page.getByRole("button", { name: /zoom in/i });
		const zoomOutBtn = page.getByRole("button", { name: /zoom out/i });
		const resetBtn = page.getByRole("button", { name: /reset view/i });

		expect((await getViewerState(pane)).scale).toBe(1);

		// Zoom in steps by a factor of 1.2
		await zoomInBtn.click();
		await expect
			.poll(async () => (await getViewerState(pane)).scale)
			.toBeCloseTo(1.2, 5);

		// Zooming back out returns to the starting scale
		await zoomOutBtn.click();
		await expect
			.poll(async () => (await getViewerState(pane)).scale)
			.toBeCloseTo(1, 5);

		// Reset returns to 100% from an arbitrary zoom level
		await zoomInBtn.click();
		await zoomInBtn.click();
		await expect
			.poll(async () => (await getViewerState(pane)).scale)
			.toBeCloseTo(1.44, 5);

		await resetBtn.click();
		await expect
			.poll(async () => (await getViewerState(pane)).scale)
			.toBeCloseTo(1, 5);
	});

	test("should support pan workflow", async ({ page }) => {
		const pane = mainViewerPane(page);

		// Establish a known pan origin. Reset is a real user action and is
		// currently the only way out of the viewer's initial pan state, which is
		// NaN on load — see "viewer pan origin is a real number on load" in
		// svg-display.spec.ts.
		await page.getByRole("button", { name: /reset view/i }).click();
		await expect.poll(async () => (await getViewerState(pane)).panX).toBe(0);

		await dragViewer(page, pane, 50, 30);

		const { panX, panY } = await getViewerState(pane);
		expect(panX).toBeCloseTo(50, 0);
		expect(panY).toBeCloseTo(30, 0);
	});

	test("should support keyboard controls workflow", async ({ page }) => {
		const pane = mainViewerPane(page);
		const svgViewer = viewer(pane);

		await svgViewer.focus();
		await expect(svgViewer).toBeFocused();

		// Keyboard zoom mirrors the toolbar buttons
		await svgViewer.press("Equal");
		await expect
			.poll(async () => (await getViewerState(pane)).scale)
			.toBeCloseTo(1.2, 5);

		await svgViewer.press("Minus");
		await expect
			.poll(async () => (await getViewerState(pane)).scale)
			.toBeCloseTo(1, 5);

		// Reset first so pan starts from a defined origin, then pan by keyboard
		await page.keyboard.press("0");
		await expect.poll(async () => (await getViewerState(pane)).panX).toBe(0);

		await svgViewer.press("Shift+ArrowRight");
		await expect
			.poll(async () => (await getViewerState(pane)).panX)
			.toBeLessThan(0);

		// Reset returns both pan and zoom to their defaults
		await page.keyboard.press("0");
		await expect
			.poll(async () => await getViewerState(pane))
			.toEqual({ scale: 1, panX: 0, panY: 0 });
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
		const pane = mainViewerPane(page);
		const svg = svgDoc(pane).locator("svg");

		// simpleJson contains only a rect, no text
		await expect(svg.locator("rect")).toHaveAttribute("fill", "blue");
		await expect(svg.locator("text")).toHaveCount(0);

		// Uploads merge, and collagen.json is overwritten by the new project's
		// manifest, so the rendered SVG switches over entirely
		await uploadProject(browserName, page, "folderWithAssets");
		await expect(svg.locator("text")).toContainText("Hello World");
		await expect(svg).toHaveAttribute("viewBox", "0 0 200 200");
		await expect(svg.locator("rect")).toHaveCount(0);
	});

	test("should handle rapid project switching", async ({
		page,
		browserName,
	}) => {
		// Rapidly switch between projects
		for (let i = 0; i < 3; i++) {
			await uploadProject(browserName, page, "simpleJson");
			await uploadProject(browserName, page, "folderWithAssets");
		}

		// The last upload wins and the viewer is left in a consistent state
		const pane = mainViewerPane(page);
		await expect(viewer(pane)).toBeVisible();
		const svg = svgDoc(pane).locator("svg");
		await expect(svg).toHaveAttribute("viewBox", "0 0 200 200");
		await expect(svg.locator("text")).toContainText("Hello World");
		await expect(errorMessage(pane)).toHaveCount(0);
	});

	test("should maintain state after error and recovery", async ({
		page,
		browserName,
	}) => {
		// Upload valid project
		await uploadProject(browserName, page, "simpleJson");
		const pane = mainViewerPane(page);
		await expect(viewer(pane)).toBeVisible();

		// Overwrite the manifest with a broken one
		await uploadProject(browserName, page, "malformedJson");
		await expect(errorMessage(pane)).toBeVisible();

		// Upload valid project again
		await uploadProject(browserName, page, "folderWithAssets");

		// Should recover completely
		await expect(errorMessage(pane)).toHaveCount(0);
		await expect(svgDoc(pane).locator("svg text")).toContainText(
			"Hello World",
		);

		// Controls should work normally
		const zoomInBtn = page.getByRole("button", { name: /zoom in/i });
		await zoomInBtn.click();
		await expect
			.poll(async () => (await getViewerState(pane)).scale)
			.toBeCloseTo(1.2, 5);
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
		const pane = mainViewerPane(page);
		await expect(viewer(pane)).toBeVisible();
		await expect(svgDoc(pane).locator("svg rect")).toBeVisible();

		// Test tablet workflow
		await page.setViewportSize({ width: 768, height: 1024 });
		await expect(viewer(pane)).toBeVisible();
		await expect(svgDoc(pane).locator("svg rect")).toBeVisible();

		// Test desktop workflow
		await page.setViewportSize({ width: 1200, height: 800 });
		await expect(viewer(pane)).toBeVisible();
		await expect(svgDoc(pane).locator("svg rect")).toBeVisible();

		// Controls should be accessible on all sizes
		await expect(
			page.getByRole("button", { name: /zoom in/i }),
		).toBeVisible();
	});

	test("should handle touch interactions on mobile", async ({
		browser,
		browserName,
	}) => {
		test.skip(browserName === "firefox", "Firefox doesn't support mobile");
		const context = await browser.newContext({
			hasTouch: true,
			isMobile: true,
			viewport: { width: 375, height: 667 },
		});
		const mobilePage = await context.newPage();

		try {
			await mobilePage.goto("/");
			await mobilePage.waitForFunction(() => window.appMounted === true, {
				timeout: 10000,
			});
			await expect(fileListRegion(mobilePage)).toBeVisible();

			await uploadProject(browserName, mobilePage, "simpleJson");

			const pane = mainViewerPane(mobilePage);
			await expect(viewer(pane)).toBeVisible();
			await expect(svgDoc(pane).locator("svg rect")).toBeVisible();

			// A tap must not disturb the rendered output
			await viewer(pane).tap();
			await expect(svgDoc(pane).locator("svg rect")).toBeVisible();
		} finally {
			await context.close();
		}
	});
});

// =============================================================================
// Text Editing Integration Tests
// =============================================================================

test.describe("Text Editing Integration", () => {
	test("editing manifest updates compact view and persists to full view on close", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, "folderWithAssets");
		await expect(fileListRegion(page)).toBeVisible();

		// The folder prefix is stripped on upload, so the manifest lands at the root
		await openFileInEditor(page, "collagen.json");

		const compact = compactViewerPane(page);

		// Verify initial text in SVG is Hello World
		await expect(svgDoc(compact).locator("svg text")).toContainText(
			"Hello World",
		);

		// Replace text to Updated
		const current = await getEditorText(page);
		expect(current).toContain("Hello World");
		await setEditorText(page, current.replace(/Hello World/g, "Updated"));

		// The compact view reflects the edit once the debounce elapses
		await expect(svgDoc(compact).locator("svg text")).toContainText(
			"Updated",
		);

		// Close editor and ensure main viewer shows updated text with controls visible
		await page.getByRole("button", { name: /close editor/i }).click();
		const pane = mainViewerPane(page);
		await expect(viewer(pane)).toBeVisible();
		await expect(svgDoc(pane).locator("svg text")).toContainText("Updated");
		await expect(viewerToolbar(page)).toBeVisible();
	});
});
