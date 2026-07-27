/**
 * Playwright tests for keyboard zoom handling in SvgDisplay / ViewerCore
 *
 * The contract under test (see `getViewerKeyAction` in
 * `src/lib/components/viewer/index.ts`):
 * - Unmodified +, =, -, _ zoom the SVG viewer, and 0 resets it.
 * - The same keys with Ctrl, Meta/Cmd or Alt held are left alone, so the
 *   browser's own page zoom still works.
 * - No viewer shortcut fires while the user is typing.
 */

import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { uploadProject } from "./upload";
import {
	compactViewerPane,
	editorTextbox,
	getViewerState,
	getZoomPercent,
	mainViewerPane,
	openFileInEditor,
	viewer,
} from "./helpers";

test.describe("Keyboard Zoom Behavior", () => {
	test.beforeEach(async ({ page, browserName }) => {
		await uploadProject(browserName, page, "simpleJson");
		await expect(viewer(mainViewerPane(page))).toBeVisible();
		expect(await getZoomPercent(page)).toBe(100);
	});

	// =========================================================================
	// Unmodified keys zoom the viewer
	// =========================================================================

	const zoomInKeys = ["+", "="];
	const zoomOutKeys = ["-", "_"];

	for (const key of zoomInKeys) {
		test(`plain '${key}' zooms in`, async ({ page }) => {
			const pane = mainViewerPane(page);

			await page.keyboard.press(key);

			await expect.poll(() => getZoomPercent(page)).toBe(120);
			expect((await getViewerState(pane)).scale).toBeCloseTo(1.2, 5);
		});
	}

	for (const key of zoomOutKeys) {
		test(`plain '${key}' zooms out`, async ({ page }) => {
			const pane = mainViewerPane(page);

			await page.keyboard.press(key);

			await expect.poll(() => getZoomPercent(page)).toBe(83); // 100 / 1.2
			expect((await getViewerState(pane)).scale).toBeCloseTo(1 / 1.2, 5);
		});
	}

	// =========================================================================
	// Modified keys are left for the browser
	// =========================================================================

	for (const modifier of ["Control", "Meta", "Alt"]) {
		for (const key of [...zoomInKeys, ...zoomOutKeys]) {
			test(`${modifier}+'${key}' leaves the viewer zoom alone`, async ({
				page,
			}) => {
				const pane = mainViewerPane(page);
				const before = await getViewerState(pane);

				await page.keyboard.press(`${modifier}+${key}`);

				// Allow a mistakenly-registered handler time to fire
				await page.waitForTimeout(150);
				expect(await getZoomPercent(page)).toBe(100);
				expect(await getViewerState(pane)).toEqual(before);
			});
		}
	}

	// =========================================================================
	// Mixed scenarios and edge cases
	// =========================================================================

	test("interleaving plain and modified keys tracks only the plain ones", async ({
		page,
	}) => {
		await page.keyboard.press("+");
		await expect.poll(() => getZoomPercent(page)).toBe(120);

		await page.keyboard.press("Control+-");
		await page.waitForTimeout(150);
		expect(await getZoomPercent(page)).toBe(120);

		await page.keyboard.press("-");
		await expect.poll(() => getZoomPercent(page)).toBe(100);

		await page.keyboard.press("Meta+=");
		await page.waitForTimeout(150);
		expect(await getZoomPercent(page)).toBe(100);
	});

	test("zoom keys behave the same when the viewer has focus", async ({
		page,
	}) => {
		const svgViewer = viewer(mainViewerPane(page));
		await svgViewer.focus();
		await expect(svgViewer).toBeFocused();

		await page.keyboard.press("+");
		await expect.poll(() => getZoomPercent(page)).toBe(120);

		await page.keyboard.press("Control+-");
		await page.waitForTimeout(150);
		expect(await getZoomPercent(page)).toBe(120);
	});

	test("zoom keys are inert in code view, and resume afterwards", async ({
		page,
	}) => {
		await page.keyboard.press("v");
		const rawSvg = page.getByRole("region", { name: "The raw SVG code" });
		await expect(rawSvg).toBeVisible();

		// Zooming is meaningless while the raw markup is shown
		await page.keyboard.press("+");
		await page.keyboard.press("-");
		await page.waitForTimeout(150);
		expect(await getZoomPercent(page)).toBe(100);

		await page.keyboard.press("v");
		await expect(viewer(mainViewerPane(page))).toBeVisible();

		await page.keyboard.press("+");
		await expect.poll(() => getZoomPercent(page)).toBe(120);
	});

	test("typing in the manifest editor never triggers viewer shortcuts", async ({
		page,
	}) => {
		await openFileInEditor(page, "collagen.json");

		// With the editor open the viewer is the compact one, which has no
		// toolbar, so read the scale off the viewer state instead.
		const compact = compactViewerPane(page);
		const before = await getViewerState(compact);

		const textbox = editorTextbox(page);
		await textbox.click();
		// Every one of these is a viewer shortcut when pressed outside an input
		await page.keyboard.type("+-0vbcs?");

		await page.waitForTimeout(200);
		expect(await getViewerState(compact)).toEqual(before);

		// The keystrokes went to the editor, as they should have
		await expect(textbox).toContainText("+-0vbcs?");
	});

	test("rapid mixed keypresses leave consistent state", async ({ page }) => {
		await page.keyboard.press("+"); // 120%
		await page.keyboard.press("Control++"); // ignored
		await page.keyboard.press("-"); // 100%
		await page.keyboard.press("Meta+-"); // ignored
		await page.keyboard.press("="); // 120%
		await page.keyboard.press("Alt+="); // ignored

		await expect.poll(() => getZoomPercent(page)).toBe(120);

		await page.keyboard.press("0");
		await expect
			.poll(async () => await getViewerState(mainViewerPane(page)))
			.toEqual({ scale: 1, panX: 0, panY: 0 });
		expect(await getZoomPercent(page)).toBe(100);
	});
});
