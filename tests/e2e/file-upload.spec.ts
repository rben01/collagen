/**
 * Upload coverage for the FileList upload surface.
 *
 * This file replaces the old file-uploader.spec.ts. The `FileUploader.svelte`
 * component it targeted was deleted; uploading now lives in `FileList.svelte`,
 * whose root is the drop target and whose "New file" / "Upload" buttons are the
 * entry points. Tests that only asserted against that component's markup (its
 * drop zone, its "Upload Collagen Project" heading, its "Browse for file or
 * folder" button), or that injected a `disabled` class and then checked the CSS
 * for it, have been dropped rather than rewritten: they described UI that cannot
 * render and behaviour the app never had.
 *
 * The scenario matrix below is the part worth keeping — every upload shape
 * crossed with every validation outcome.
 */

import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";
import {
	uploadProject,
	uploadWithDragAndDrop,
	uploadWithFilePicker,
	type ProjectFiles,
} from "./upload";
import {
	errorMessage,
	fileListRegion,
	mainViewerPane,
	svgDoc,
	viewer,
} from "./helpers";

/** Assert the project rendered, with the given viewBox. */
async function expectRendered(page: Page, viewBox: string) {
	const pane = mainViewerPane(page);
	await expect(viewer(pane)).toBeVisible();
	await expect(svgDoc(pane).locator("svg")).toHaveAttribute(
		"viewBox",
		viewBox,
	);
	await expect(errorMessage(pane)).toHaveCount(0);
}

/** Assert the app reported a failure matching `pattern`, and rendered nothing. */
async function expectError(page: Page, pattern: RegExp) {
	const pane = mainViewerPane(page);
	await expect(errorMessage(pane)).toBeVisible();
	await expect(errorMessage(pane)).toContainText(pattern);
	await expect(viewer(pane)).toHaveCount(0);
}

const manifest = (viewBox: string, children: unknown[] = []) =>
	JSON.stringify({ attrs: { viewBox }, children });

// =============================================================================
// Upload affordances
// =============================================================================

test.describe("Upload affordances", () => {
	test("the file list is the drop target and offers both entry points", async ({
		page,
	}) => {
		const fileList = fileListRegion(page);
		await expect(fileList).toBeVisible();
		await expect(fileList).toHaveAttribute(
			"data-testid",
			"filelist-dropzone",
		);

		const newFileButton = fileList.getByRole("button", {
			name: "Create new empty file",
		});
		const uploadButton = fileList.getByRole("button", {
			name: "Browse for files, keyboard shortcut O key",
		});

		await expect(newFileButton).toBeEnabled();
		await expect(uploadButton).toBeEnabled();
		await expect(newFileButton).toHaveText("New file");
		await expect(uploadButton).toHaveText("Upload");

		// Starts empty
		await expect(fileList.getByRole("heading", { level: 3 })).toHaveText(
			"Files (0)",
		);
	});

	test("the Upload button opens a multi-select file picker", async ({
		page,
	}) => {
		const fileChooserPromise = page.waitForEvent("filechooser");

		await fileListRegion(page)
			.getByRole("button", {
				name: "Browse for files, keyboard shortcut O key",
			})
			.click();

		const fileChooser = await fileChooserPromise;
		expect(fileChooser.isMultiple()).toBe(true);
	});

	test("repeated clicks on Upload do not break the panel", async ({
		page,
	}) => {
		const uploadButton = fileListRegion(page).getByRole("button", {
			name: "Browse for files, keyboard shortcut O key",
		});

		// Each click opens a chooser; dismiss each so the next can open
		for (let i = 0; i < 3; i++) {
			const chooserPromise = page.waitForEvent("filechooser");
			await uploadButton.click();
			await (await chooserPromise).setFiles([]);
		}

		await expect(uploadButton).toBeEnabled();
		await expect(
			fileListRegion(page).getByRole("heading", { level: 3 }),
		).toHaveText("Files (0)");
	});
});

// =============================================================================
// Scenario matrix: shape of upload x validity
// =============================================================================

test.describe("Single file uploads", () => {
	test("a valid single JSON manifest renders", async ({ page }) => {
		await uploadWithFilePicker(page, "simpleJson");

		await expectRendered(page, "0 0 100 100");
		await expect(
			fileListRegion(page).getByText("collagen.json", { exact: true }),
		).toBeVisible();
	});

	test("a malformed JSON manifest reports a parse error", async ({ page }) => {
		await uploadWithFilePicker(page, "malformedJson");

		await expectError(page, /json|parse/i);
	});

	test("a valid single Jsonnet manifest renders", async ({ page }) => {
		await uploadWithFilePicker(page, "simpleJsonnet");

		await expectRendered(page, "0 0 100 100");
	});

	test("a malformed Jsonnet manifest reports an error", async ({ page }) => {
		await uploadWithFilePicker(page, "malformedJsonnet");

		await expectError(page, /jsonnet|error|expected/i);
	});

	test("a single non-manifest file reports a missing manifest", async ({
		page,
	}) => {
		await uploadWithFilePicker(page, { "readme.txt": "no manifest here" });

		await expectError(page, /manifest/i);
	});
});

test.describe("Multiple file uploads", () => {
	test("a manifest alongside other files renders", async ({ page }) => {
		await uploadWithFilePicker(page, "multipleFilesValid");

		await expectRendered(page, "0 0 150 150");
		const fileList = fileListRegion(page);
		await expect(fileList.getByRole("heading", { level: 3 })).toHaveText(
			"Files (3)",
		);
	});

	test("several files with no manifest report a missing manifest", async ({
		page,
	}) => {
		await uploadWithFilePicker(page, "noManifest");

		await expectError(page, /manifest/i);
	});

	test("Jsonnet imports resolve across separately uploaded files", async ({
		page,
	}) => {
		// simpleJsonnet's manifest does `import("viewbox.jsonnet")`
		await uploadWithFilePicker(page, "simpleJsonnet");

		await expectRendered(page, "0 0 100 100");
		await expect(
			svgDoc(mainViewerPane(page)).locator("svg rect"),
		).toHaveAttribute("fill", "red");
	});
});

test.describe("Folder uploads", () => {
	test("a valid folder has its root prefix stripped and renders", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, "folderWithAssets");

		await expectRendered(page, "0 0 200 200");

		// "project/" is stripped, so the manifest sits at the root and its
		// relative image_path resolves
		const fileList = fileListRegion(page);
		await expect(
			fileList.getByText("collagen.json", { exact: true }),
		).toBeVisible();
		await expect(
			fileList.getByText("assets/test.png", { exact: true }),
		).toBeVisible();
		await expect(
			svgDoc(mainViewerPane(page)).locator("svg image"),
		).toHaveAttribute("href", /^data:image\/png;base64,/);
	});

	test("a folder without a manifest reports a missing manifest", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, "folderNoManifest");

		await expectError(page, /manifest/i);
	});

	test("a deeply nested folder still resolves relative asset paths", async ({
		page,
		browserName,
	}) => {
		const deepFolderProject: ProjectFiles = {
			"project/l1/l2/l3/l4/l5/collagen.json": manifest("0 0 100 100", [
				{ image_path: "assets/deep.png" },
			]),
			"project/l1/l2/l3/l4/l5/assets/deep.png": "fake image data",
		};

		await uploadProject(browserName, page, deepFolderProject);

		await expectRendered(page, "0 0 100 100");
		await expect(
			svgDoc(mainViewerPane(page)).locator("svg image"),
		).toHaveAttribute("href", /^data:image\/png;base64,/);
	});

	test("two sibling folders cannot resolve a manifest", async ({
		page,
		browserName,
	}) => {
		// With two roots there is no common prefix to strip, so the manifest
		// never lands at the top level and cannot be found.
		await uploadProject(browserName, page, {
			"alpha/collagen.json": manifest("0 0 100 100"),
			"beta/notes.txt": "unrelated",
		});

		await expectError(page, /manifest/i);
	});

	test("a folder mixed with a loose file keeps the loose file at the root", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, {
			"collagen.json": manifest("0 0 120 120"),
			"assets/logo.png": "fake image data",
		});

		await expectRendered(page, "0 0 120 120");
		await expect(
			fileListRegion(page).getByText("assets/logo.png", { exact: true }),
		).toBeVisible();
	});
});

// =============================================================================
// Merging, .clgn bundles, and robustness
// =============================================================================

test.describe("Upload merging", () => {
	test.skip(
		({ browserName }) => browserName !== "chromium",
		"second upload uses the drag-and-drop path",
	);

	test("a later upload merges into the existing project", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, {
			"collagen.json": manifest("0 0 100 100", [
				{ image_path: "later.png" },
			]),
		});

		// The manifest references a file that has not been uploaded yet
		await expectError(page, /later\.png|missing|not found/i);

		await uploadWithDragAndDrop(page, { "later.png": "fake image data" });

		await expectRendered(page, "0 0 100 100");
		await expect(
			fileListRegion(page).getByRole("heading", { level: 3 }),
		).toHaveText("Files (2)");
	});

	test("re-uploading a path overwrites the previous contents", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, {
			"collagen.json": manifest("0 0 100 100", [
				{ tag: "rect", attrs: { width: 10, height: 10, fill: "blue" } },
			]),
		});
		await expect(
			svgDoc(mainViewerPane(page)).locator("svg rect"),
		).toHaveAttribute("fill", "blue");

		await uploadWithDragAndDrop(page, {
			"collagen.json": manifest("0 0 100 100", [
				{ tag: "rect", attrs: { width: 10, height: 10, fill: "green" } },
			]),
		});

		await expect(
			svgDoc(mainViewerPane(page)).locator("svg rect"),
		).toHaveAttribute("fill", "green");
		await expect(
			fileListRegion(page).getByRole("heading", { level: 3 }),
		).toHaveText("Files (1)");
	});
});

test.describe("Bundled .clgn uploads", () => {
	test("a .clgn bundle is expanded into its constituent files", async ({
		page,
	}) => {
		// This is the format `downloadProject()` writes: base64 file contents
		// keyed by path.
		const bundle = JSON.stringify({
			files: {
				"collagen.json": Buffer.from(manifest("0 0 300 300")).toString(
					"base64",
				),
				"notes/readme.txt": Buffer.from("bundled note").toString("base64"),
			},
		});

		await uploadWithFilePicker(page, { "project.clgn": bundle });

		await expectRendered(page, "0 0 300 300");
		const fileList = fileListRegion(page);
		// The bundle itself is not kept; only its contents
		await expect(fileList.getByRole("heading", { level: 3 })).toHaveText(
			"Files (2)",
		);
		await expect(
			fileList.getByText("collagen.json", { exact: true }),
		).toBeVisible();
		await expect(
			fileList.getByText("notes/readme.txt", { exact: true }),
		).toBeVisible();
	});

	test("a malformed .clgn bundle is reported without losing the panel", async ({
		page,
	}) => {
		// A bundle that cannot be parsed contributes no files at all
		await uploadWithFilePicker(
			page,
			{ "broken.clgn": '{"not-files": true}' },
			{ expectFileCount: 0 },
		);

		// The upload error surfaces in its own pane, and the app stays usable
		await expect(
			page.getByRole("region", { name: "File upload issues" }),
		).toBeVisible({ timeout: 5000 });
		await expect(fileListRegion(page)).toBeVisible();
	});
});

test.describe("Upload robustness", () => {
	test("very long file names are accepted and displayed", async ({ page }) => {
		const longFileName = "a".repeat(200) + ".txt";

		await uploadWithFilePicker(page, {
			"collagen.json": manifest("0 0 100 100"),
			[longFileName]: "content",
		});

		await expectRendered(page, "0 0 100 100");
		await expect(
			fileListRegion(page).getByText(longFileName, { exact: true }),
		).toBeAttached();
	});

	test("an empty manifest file reports an error rather than rendering", async ({
		page,
	}) => {
		await uploadWithFilePicker(page, { "collagen.json": "" });

		await expectError(page, /.+/);
	});

	test("a project with many files uploads and renders", async ({
		page,
		browserName,
	}) => {
		const manyFilesProject: ProjectFiles = {
			"collagen.json": manifest("0 0 100 100"),
		};
		for (let i = 0; i < 50; i++) {
			manyFilesProject[`file${i}.txt`] = `Content of file ${i}`;
		}

		await uploadProject(browserName, page, manyFilesProject);

		await expectRendered(page, "0 0 100 100");
		await expect(
			fileListRegion(page).getByRole("heading", { level: 3 }),
		).toHaveText("Files (51)");
	});
});
