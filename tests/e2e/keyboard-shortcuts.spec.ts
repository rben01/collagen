/**
 * Global keyboard shortcuts other than zoom.
 *
 * Zoom keys (+, =, -, _, 0) and their modifier behaviour are covered in
 * keyboard-zoom.spec.ts; this file covers the action shortcuts and the file
 * list's "O" upload shortcut.
 */

import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { uploadProject } from "./upload";
import {
	fileListRegion,
	mainViewerPane,
	openFileInEditor,
	viewer,
} from "./helpers";

test.describe("Viewer action shortcuts", () => {
	test.beforeEach(async ({ page, browserName }) => {
		await uploadProject(browserName, page, "simpleJson");
		await expect(viewer(mainViewerPane(page))).toBeVisible();
	});

	test("'s' downloads the generated SVG", async ({ page }) => {
		const downloadPromise = page.waitForEvent("download");

		await page.keyboard.press("s");

		const download = await downloadPromise;
		expect(download.suggestedFilename()).toBe("collagen-output.svg");
		await expect(page.getByRole("alert")).toContainText("SVG downloaded");
	});

	test("'c' copies the generated SVG to the clipboard", async ({
		page,
		browserName,
		context,
	}) => {
		test.skip(
			browserName !== "chromium",
			"only chromium supports reading the clipboard from tests",
		);
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);

		await page.keyboard.press("c");

		await expect(page.getByRole("alert")).toContainText(
			"SVG copied to clipboard",
		);
		const clipboard = await page.evaluate(() =>
			navigator.clipboard.readText(),
		);
		expect(clipboard).toContain('viewBox="0 0 100 100"');
		expect(clipboard).toContain('fill="blue"');
	});

	test("'v' toggles the raw code view", async ({ page }) => {
		const rawSvg = page.getByRole("region", { name: "The raw SVG code" });
		await expect(rawSvg).toHaveCount(0);

		await page.keyboard.press("v");
		await expect(rawSvg).toBeVisible();
		await expect(rawSvg.locator("code")).toContainText('fill="blue"');

		await page.keyboard.press("v");
		await expect(rawSvg).toHaveCount(0);
		await expect(viewer(mainViewerPane(page))).toBeVisible();
	});

	test("'?' toggles the usage instructions", async ({ page }) => {
		const instructions = page.getByRole("region", {
			name: "Usage instructions",
		});
		await expect(instructions).toHaveCount(0);

		await page.keyboard.press("?");
		await expect(instructions).toBeVisible();

		await page.keyboard.press("?");
		await expect(instructions).toHaveCount(0);
	});

	test("action shortcuts do not fire when a modifier is held", async ({
		page,
	}) => {
		// Ctrl+S / Cmd+S must reach the browser's own "save page", not the viewer
		const rawSvg = page.getByRole("region", { name: "The raw SVG code" });

		await page.keyboard.press("Control+v");
		await page.keyboard.press("Meta+v");
		await page.waitForTimeout(150);
		await expect(rawSvg).toHaveCount(0);

		const instructions = page.getByRole("region", {
			name: "Usage instructions",
		});
		await page.keyboard.press("Alt+?");
		await page.waitForTimeout(150);
		await expect(instructions).toHaveCount(0);
	});

	test("'?' is suppressed while the manifest editor is open", async ({
		page,
	}) => {
		// SvgDisplay guards the help toggle on `editorPath` so the instructions
		// panel cannot cover the editor.
		await openFileInEditor(page, "collagen.json");

		await page.locator("body").press("?");

		await page.waitForTimeout(150);
		await expect(
			page.getByRole("region", { name: "Usage instructions" }),
		).toHaveCount(0);
	});
});

test.describe("File list upload shortcut", () => {
	test("'O' opens the file picker", async ({ page }) => {
		// FileList binds this globally, but only while focus is on the body, so
		// that it cannot hijack typing.
		const fileChooserPromise = page.waitForEvent("filechooser");

		await page.keyboard.press("o");

		const fileChooser = await fileChooserPromise;
		expect(fileChooser.isMultiple()).toBe(true);
	});

	test("'O' is ignored while a control has focus", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, "simpleJson");

		// Focus a button, so `document.activeElement` is no longer the body
		const browseButton = fileListRegion(page).getByRole("button", {
			name: "Browse for files, keyboard shortcut O key",
		});
		await browseButton.focus();
		await expect(browseButton).toBeFocused();

		let chooserOpened = false;
		page.once("filechooser", () => {
			chooserOpened = true;
		});

		await page.keyboard.press("o");
		await page.waitForTimeout(300);

		expect(chooserOpened).toBe(false);
	});
});
