import { expect, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { fileListRegion } from "./helpers";

export type ProjectFiles = Record<string, string>;

const _sampleProjectContents = {
	// Valid single file projects
	simpleJson: {
		"collagen.json": JSON.stringify(
			{
				attrs: { viewBox: "0 0 100 100" },
				children: [
					{
						tag: "rect",
						attrs: { x: 0, y: 0, width: 50, height: 50, fill: "blue" },
					},
				],
			},
			null,
			2,
		),
	},

	simpleJsonnet: {
		"collagen.jsonnet": `
			local viewBox = import("viewbox.jsonnet");
			{
				attrs: { viewBox: viewBox },
				children: [
					{
						tag: "rect",
						attrs: { x: 0, y: 0, width: 50, height: 50, fill: "red" }
					}
				]
			}`,
		"viewbox.jsonnet": '"0 0 100 100"',
	},

	// Valid folder projects
	folderWithAssets: {
		"project/collagen.json": JSON.stringify(
			{
				attrs: { viewBox: "0 0 200 200" },
				children: [
					{
						image_path: "assets/test.png",
						attrs: { x: 10, y: 10, width: 100, height: 100 },
					},
					{
						tag: "text",
						attrs: { x: 10, y: 20 },
						children: "Hello World",
					},
				],
			},
			null,
			2,
		),
		"project/assets/test.png": "fake-png-data",
		"project/styles.css": "body { margin: 0; }",
	},
	complexFolder: {
		"myproject/collagen.jsonnet": `local width = 300;
			{
			attrs: { viewBox: "0 0 %d %d" % [width, width] },
			children: [
				{ image_path: "images/logo.jpg" },
				{ tag: "circle", attrs: { cx: 150, cy: 150, r: 50, fill: "green" } }
			]
		}`,
		"myproject/images/logo.jpg": "fake-jpg-data",
		"myproject/data.json": '{"config": "value"}',
		"myproject/nested/deep/file.txt": "nested content",
	},

	// Multiple files (valid)
	multipleFilesValid: {
		"collagen.json": JSON.stringify({
			attrs: { viewBox: "0 0 150 150" },
			children: [
				{ tag: "circle", attrs: { cx: 75, cy: 75, r: 25, fill: "purple" } },
			],
		}),
		"data.txt": "some data",
		"config.json": '{"setting": true}',
	},

	// Invalid projects - missing manifest
	noManifest: {
		"readme.txt": "This project has no manifest file",
		"data.json": '{"some": "data"}',
	},

	folderNoManifest: {
		"project/readme.txt": "No manifest in this folder",
		"project/assets/image.png": "fake-image-data",
	},

	// Invalid projects - malformed files
	malformedJson: {
		"collagen.json": '{ "attrs": { "viewBox": "0 0 100 100" }, invalid json',
	},

	malformedJsonnet: { "collagen.jsonnet": "{ invalid jsonnet syntax }" },
};
export type ProjectName = keyof typeof _sampleProjectContents;

// magic to make { [f1]: content } | { [f2]: content } => { [f1]: { content, type } } | { [f2]: { content, type } }
// and *not* { [f1] | [f2]: content }
type Projectified<T> = T extends unknown
	? { [K in keyof T]: { content: T[K]; type: string } }
	: never;

function projectify<T extends Record<string, string>>(project: T) {
	const o = {} as Record<keyof T, { content: string; type: string }>;

	const mimeTypes = {
		json: "application/json",
		jsonnet: "text/plain",
		png: "image/png",
		jpg: "image/jpg",
		jpeg: "image/jpg",
		txt: "text/plain",
		css: "text/css",
	};

	for (const path in project) {
		const content = project[path];

		const extn = path.match(/.+\.([^.]+)$/);
		const type =
			extn === null
				? mimeTypes.txt
				: (mimeTypes[extn[1] as keyof typeof mimeTypes] ?? mimeTypes.txt);

		o[path] = { content, type };
	}

	return o as Projectified<T>;
}

const sampleProjects = (() => {
	const o = {} as Record<
		ProjectName,
		Record<string, { content: string; type: string }>
	>;
	for (const projectName in _sampleProjectContents) {
		o[projectName as ProjectName] = projectify(
			_sampleProjectContents[projectName as ProjectName],
		);
	}
	return o;
})();

function resolveProject(project: ProjectName | ProjectFiles) {
	return typeof project === "string"
		? sampleProjects[project]
		: projectify(project);
}

// =============================================================================
// Upload Testing Utilities
// =============================================================================

/**
 * Wait until an upload has actually landed.
 *
 * Both upload paths hand off to async app code (`collectFromDataTransfer` /
 * `collectFromFileList`, then SVG regeneration), so neither the dispatched drop
 * nor `setFiles` returning means the app has caught up. Two signals are checked:
 *
 * 1. The file list's own count reaches at least the number of files uploaded.
 *    Uploads merge into the existing filesystem, so this is a lower bound.
 * 2. The app settles on either a rendered viewer or an error. Uses a CSS
 *    `:visible` filter because the compact viewer shares the viewer's aria-label
 *    while being `display: none`.
 */
async function waitForUpload(page: Page, minFileCount: number) {
	await expect
		.poll(
			async () => {
				const heading = await fileListRegion(page)
					.getByRole("heading", { level: 3 })
					.innerText();
				return Number(heading.match(/Files \((\d+)\)/)?.[1] ?? -1);
			},
			{ timeout: 15000 },
		)
		.toBeGreaterThanOrEqual(minFileCount);

	// With no files there is nothing to render and nothing to fail on: the app
	// resets to its empty state, so there is no settled state to wait for.
	if (minFileCount === 0) return;

	await expect(
		page
			.locator(
				'[aria-label="Interactive SVG viewer"]:visible, .error-message:visible',
			)
			.first(),
	).toBeVisible({ timeout: 15000 });
}

export interface UploadOptions {
	/**
	 * How many files the filesystem should end up holding, when that differs
	 * from the number handed to the browser. A `.clgn` bundle expands into its
	 * contents (so more), and a malformed one contributes nothing (so zero).
	 */
	expectFileCount?: number;
}

/**
 * Teach the page to report a `webkitRelativePath` for files supplied through the
 * file picker.
 *
 * Why this is necessary: `collectFromFileList` reads `file.webkitRelativePath`
 * to reconstruct folder structure, but browsers only populate it for a genuine
 * directory selection, and Playwright's `FileChooser.setFiles` has no way to set
 * it. Without this shim a folder project uploads flattened, the manifest's
 * relative `image_path`s stop resolving, and the test would be exercising a
 * scenario the user never encounters.
 *
 * What it does NOT cover: this is the only browser behaviour being simulated.
 * The picker itself, the `File` objects, the change event, and every line of app
 * code from `openFilePicker` onwards are real. Directory *traversal* (the user
 * picking a folder rather than a file set) is still not exercised — the browser
 * never builds a directory listing here.
 */
async function stageRelativePaths(
	page: Page,
	relPathsByName: Record<string, string>,
) {
	await page.evaluate(relPaths => {
		window.__e2eRelPaths = relPaths;
		if (window.__e2eRelPathsPatched) return;
		Object.defineProperty(File.prototype, "webkitRelativePath", {
			configurable: true,
			get(this: File) {
				return window.__e2eRelPaths?.[this.name] ?? "";
			},
		});
		window.__e2eRelPathsPatched = true;
	}, relPathsByName);
}

/**
 * Upload via the real file picker: click "Upload", catch the file chooser the
 * browser opens, and hand it the files.
 *
 * `FileList.openFilePicker()` builds its `<input type="file">` on demand and
 * removes it again on change, so there is no static input to target with
 * `setInputFiles` — the chooser event is the only handle on it.
 *
 * This is the only upload path available in Firefox and WebKit, where a
 * synthetic `DataTransfer` produces entries whose `file()` callback always
 * errors.
 */
export async function uploadWithFilePicker(
	page: Page,
	project: ProjectName | ProjectFiles,
	options: UploadOptions = {},
) {
	const projectFiles = resolveProject(project);

	const relPathsByName: Record<string, string> = {};
	const payload: { name: string; mimeType: string; buffer: Buffer }[] = [];
	for (const path in projectFiles) {
		const name = path.split("/").pop()!;
		if (name in relPathsByName) {
			throw new Error(
				`Cannot upload '${path}' via the file picker: basename '${name}' is ` +
					`already used by '${relPathsByName[name]}'. The picker keys files ` +
					`by name, so basenames must be unique within a project.`,
			);
		}
		relPathsByName[name] = path;
		const { content, type } = projectFiles[path];
		payload.push({ name, mimeType: type, buffer: Buffer.from(content) });
	}

	await stageRelativePaths(page, relPathsByName);

	const fileChooserPromise = page.waitForEvent("filechooser");
	await fileListRegion(page)
		.getByRole("button", {
			name: "Browse for files, keyboard shortcut O key",
		})
		.click();
	const fileChooser = await fileChooserPromise;
	await fileChooser.setFiles(payload);

	await waitForUpload(page, options.expectFileCount ?? payload.length);
}

/**
 * Upload by dispatching drag events carrying a synthetic `DataTransfer` at the
 * file list.
 *
 * Chromium-only. In Chromium, `webkitGetAsEntry()` on a programmatically added
 * `File` yields an entry whose `fullPath` is derived from `File.name`, which is
 * why each file is constructed with its *full* project path as its name — that
 * is what lets folder projects round-trip. Firefox and WebKit return an entry
 * whose `file()` callback always fails, so nothing is collected there.
 */
export async function uploadWithDragAndDrop(
	page: Page,
	project: ProjectName | ProjectFiles,
	options: UploadOptions = {},
) {
	const projectFiles = resolveProject(project);

	await page.evaluate(
		({ fileData }) => {
			const dropZone = document.querySelector(
				'[data-testid="filelist-dropzone"]',
			);
			if (!dropZone) throw new Error("File list drop zone not found");

			const dt = new DataTransfer();
			for (const path in fileData) {
				const { content, type } = fileData[path];
				dt.items.add(new File([content], path, { type }));
			}

			for (const type of ["dragenter", "dragover", "drop"]) {
				dropZone.dispatchEvent(
					new DragEvent(type, {
						bubbles: true,
						cancelable: true,
						dataTransfer: dt,
					}),
				);
			}
		},
		{ fileData: projectFiles },
	);

	await waitForUpload(
		page,
		options.expectFileCount ?? Object.keys(projectFiles).length,
	);
}

/**
 * Upload a project using whichever mechanism actually works in the browser under
 * test. Prefer this in browser-agnostic specs.
 */
export async function uploadProject(
	browserName: "chromium" | "webkit" | "firefox",
	page: Page,
	project: ProjectName | ProjectFiles,
	options: UploadOptions = {},
) {
	if (browserName === "chromium") {
		return await uploadWithDragAndDrop(page, project, options);
	} else {
		return await uploadWithFilePicker(page, project, options);
	}
}

/**
 * Drop additional files onto the file list after an initial upload.
 * Chromium-only, for the same reason as {@link uploadWithDragAndDrop}.
 */
export async function uploadMoreToFileList(
	page: Page,
	project: ProjectName | ProjectFiles,
	options: UploadOptions = {},
) {
	return await uploadWithDragAndDrop(page, project, options);
}

/** Simulate a drag hovering over, then leaving, the file list drop target. */
export async function hoverDragOverFileList(page: Page, leave: boolean) {
	await page.evaluate(shouldLeave => {
		const dropZone = document.querySelector(
			'[data-testid="filelist-dropzone"]',
		);
		if (!dropZone) throw new Error("File list drop zone not found");
		const dispatch = (type: string) =>
			dropZone.dispatchEvent(
				new DragEvent(type, {
					bubbles: true,
					cancelable: true,
					dataTransfer: new DataTransfer(),
				}),
			);
		if (shouldLeave) {
			dispatch("dragleave");
		} else {
			dispatch("dragenter");
			dispatch("dragover");
		}
	}, leave);
}
