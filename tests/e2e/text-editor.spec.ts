/**
 * End-to-end tests focused on the in-app text editor
 */

import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";
import { uploadProject } from "./upload";
import {
	compactViewerPane,
	errorMessage,
	fileListRegion,
	getEditorText,
	mainViewerPane,
	openFileInEditor,
	setEditorText,
	svgDoc,
	textEditorPane,
	viewer,
	viewerToolbar,
} from "./helpers";

function getViewportWidth(page: Page) {
	return page.viewportSize()?.width ?? 1200;
}

/** A simpleJson-shaped manifest whose rect uses the given fill. */
function manifestWithFill(fill: string) {
	return JSON.stringify(
		{
			attrs: { viewBox: "0 0 100 100" },
			children: [
				{ tag: "rect", attrs: { x: 0, y: 0, width: 50, height: 50, fill } },
			],
		},
		null,
		2,
	);
}

test.describe("Text Editor", () => {
	test.beforeEach(async ({ page, browserName }) => {
		await uploadProject(browserName, page, "simpleJson");
		await expect(fileListRegion(page)).toBeVisible();
	});

	test("opens on text file click and shows compact SVG without controls", async ({
		page,
	}) => {
		await openFileInEditor(page, "collagen.json");

		const editor = textEditorPane(page);
		await expect(
			editor.getByRole("button", { name: "Close editor" }),
		).toBeVisible();
		// CodeMirror exposes its contenteditable surface as a textbox
		await expect(editor.getByRole("textbox")).toBeVisible();
		await expect(await getEditorText(page)).toContain('"viewBox"');

		// Compact SVG replaces the main viewer, and carries no controls
		const compact = compactViewerPane(page);
		await expect(compact).toBeVisible();
		await expect(svgDoc(compact).locator("svg rect")).toHaveAttribute(
			"fill",
			"blue",
		);
		await expect(viewerToolbar(page)).toHaveCount(0);
		await expect(mainViewerPane(page)).toHaveCount(0);
	});

	test("keyboard activation on file row (Enter/Space)", async ({ page }) => {
		const rowBtn = fileListRegion(page).getByRole("button", {
			name: "Edit collagen.json",
			exact: true,
		});
		await rowBtn.focus();
		await expect(rowBtn).toBeFocused();

		await page.keyboard.press("Enter");
		await expect(textEditorPane(page)).toBeVisible();

		// Close and try Space (reopen)
		await page.getByRole("button", { name: "Close editor" }).click();
		await expect(textEditorPane(page)).toHaveCount(0);

		await rowBtn.focus();
		await page.keyboard.press(" ");
		await expect(textEditorPane(page)).toBeVisible();
	});

	test("layout widens sidebar and splits heights while editing, restores on close", async ({
		page,
	}) => {
		await openFileInEditor(page, "collagen.json");

		const sidebar = page.locator(".sidebar");
		const top = page.locator(".sidebar-top");
		const bottom = page.locator(".sidebar-bottom.compact-svg");

		const viewportW = getViewportWidth(page);
		const sidebarBox = await sidebar.boundingBox();
		expect(sidebarBox).not.toBeNull();
		// 35vw ± 30px tolerance
		expect(
			Math.abs(sidebarBox!.width - 0.35 * viewportW),
		).toBeLessThanOrEqual(30);

		const topBox = await top.boundingBox();
		const bottomBox = await bottom.boundingBox();
		expect(topBox).not.toBeNull();
		expect(bottomBox).not.toBeNull();
		expect(Math.abs(topBox!.height - bottomBox!.height)).toBeLessThanOrEqual(
			30,
		);

		// Close editor and check sidebar returns to ~25vw
		await page.getByRole("button", { name: "Close editor" }).click();
		const sidebarBox2 = await sidebar.boundingBox();
		expect(sidebarBox2).not.toBeNull();
		expect(
			Math.abs(sidebarBox2!.width - 0.25 * viewportW),
		).toBeLessThanOrEqual(30);
	});

	test("edits are persisted and re-rendered in the compact view", async ({
		page,
	}) => {
		await openFileInEditor(page, "collagen.json");

		const compact = compactViewerPane(page);
		const rect = svgDoc(compact).locator("svg rect");
		await expect(rect).toHaveAttribute("fill", "blue");

		await setEditorText(page, manifestWithFill("green"));

		// Persistence is debounced, so this needs to retry rather than sample once
		await expect(rect).toHaveAttribute("fill", "green", { timeout: 5000 });

		// The compact viewer never grows controls mid-edit
		await expect(viewerToolbar(page)).toHaveCount(0);
	});

	test("edits survive closing the editor", async ({ page }) => {
		await openFileInEditor(page, "collagen.json");
		await setEditorText(page, manifestWithFill("magenta"));
		await expect(
			svgDoc(compactViewerPane(page)).locator("svg rect"),
		).toHaveAttribute("fill", "magenta", { timeout: 5000 });

		await page.getByRole("button", { name: "Close editor" }).click();

		// The edit is reflected in the main viewer, and re-opening the file shows
		// the saved text rather than the originally uploaded content
		await expect(
			svgDoc(mainViewerPane(page)).locator("svg rect"),
		).toHaveAttribute("fill", "magenta");

		await openFileInEditor(page, "collagen.json");
		expect(await getEditorText(page)).toContain("magenta");
	});

	test("invalid JSON shows compact error, then recovers", async ({ page }) => {
		await openFileInEditor(page, "collagen.json");
		const compact = compactViewerPane(page);

		// Break the JSON
		await setEditorText(page, "{");
		await expect(errorMessage(compact)).toBeVisible({ timeout: 5000 });
		// The error must not be replaced by the empty "waiting" placeholder
		await expect(compact.locator(".waiting-state")).toHaveCount(0);

		// Fix JSON
		await setEditorText(page, manifestWithFill("red"));

		await expect(errorMessage(compact)).toHaveCount(0, { timeout: 5000 });
		await expect(svgDoc(compact).locator("svg rect")).toHaveAttribute(
			"fill",
			"red",
		);
	});

	test("closing editor restores main viewer and its controls", async ({
		page,
	}) => {
		await openFileInEditor(page, "collagen.json");
		await page.getByRole("button", { name: "Close editor" }).click();

		// Main viewer and its controls return
		await expect(viewer(mainViewerPane(page))).toBeVisible();
		await expect(viewerToolbar(page)).toBeVisible();

		// Compact viewer is hidden again, so it leaves the accessibility tree
		await expect(compactViewerPane(page)).toHaveCount(0);
	});
});
