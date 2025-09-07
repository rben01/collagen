import { expect, type Page } from "@playwright/test";

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

// =============================================================================
// Simple Upload Testing Utilities
// =============================================================================

async function waitForUpload(page: Page, { timeout } = { timeout: 3000 }) {
	const postUploadElem = page.locator(".file-list, .error-message").first();
	await postUploadElem.scrollIntoViewIfNeeded();
	expect(postUploadElem).toBeVisible({ timeout });
}

/**
 * Test file picker upload by simulating browse button click and file selection
 *
 * This is less faithful to the actual tests we want to perform (drag and drop) but in
 * non-chromium browsers, this is *the only* way to upload files. Unfortunately this
 * means you can't test dropping a folder in non-chromium browsers; you've gotta just do
 * that by hand.
 */
export async function uploadWithFilePicker(
	page: Page,
	project: ProjectName | ProjectFiles,
) {
	const projectFiles =
		typeof project === "string"
			? sampleProjects[project]
			: projectify(project);

	// For subsequent uploads, the compact uploader should already be visible
	// No need to click any special button - just proceed with file selection

	// Click the browse button to trigger file picker
	await page
		.getByRole("button", { name: "Browse for file or folder" })
		.click({ timeout: 5000 });

	// Set files on the file input that gets created
	await page.evaluate(
		async ({ fileData }) => {
			// Find the hidden file input that was created
			const input = document.getElementById(
				"file-input-hidden",
			) as HTMLInputElement;
			if (!input) {
				throw new Error("File input not found");
			}

			// this block of code here is also used in testDragAndDropUpload.
			// unfortunately, while we'd like to extract it to a function and then expose
			// that function to the page, our options are limited because DataTransfer
			// doesn't exist in node and File can't be moved between node and the browser
			const dt = new DataTransfer();
			for (const path in fileData) {
				const { content, type } = fileData[path];

				const file = new File([content], path, { type });
				// Add webkitRelativePath for folder uploads
				if (path.includes("/")) {
					Object.defineProperty(file, "webkitRelativePath", {
						value: path,
						writable: false,
					});
				}
				dt.items.add(file);
			}

			Object.defineProperty(input, "files", {
				value: dt.files,
				writable: false,
			});

			input.dispatchEvent(new Event("change", { bubbles: true }));
		},
		{ fileData: projectFiles },
	);

	await waitForUpload(page);
}

/**
 * Test drag-and-drop upload by simulating drag and drop events on the drop zone
 *
 * NOTE: when testing, in non-chromium browsers, the files will be have
 * `webkitGetAsEntry()`, but the `entryFile.file(success, error)` `success` callback
 * will always fail. So you shouldn't call this in browser-agnostic tests, which is why
 * we have `uploadProject`, which uses the “correct” (albeit less fully tested) upload
 * method for the browser being tested
 */
async function uploadWithDragAndDrop(
	page: Page,
	project: ProjectName | ProjectFiles,
) {
	const projectFiles =
		typeof project === "string"
			? sampleProjects[project]
			: projectify(project);

	// Simulate drag and drop on the drop zone
	await page.evaluate(
		async ({ fileData }) => {
			const dropZone =
				document.querySelector('[data-testid="upload-dropzone"]') ||
				document.querySelector('[data-testid="filelist-dropzone"]') ||
				document.querySelector(".file-list") ||
				document.querySelector(".drop-zone");
			if (!dropZone) throw new Error("Drop zone not found");

			// see above for why this duplicate block of code can't be deduplicated
			const dt = new DataTransfer();
			for (const path in fileData) {
				const { content, type } = fileData[path];

				const file = new File([content], path, { type });
				// Add webkitRelativePath for folder uploads
				if (path.includes("/")) {
					Object.defineProperty(file, "webkitRelativePath", {
						value: path,
						writable: false,
					});
				}
				dt.items.add(file);
			}

			dropZone.dispatchEvent(
				new DragEvent("dragenter", {
					bubbles: true,
					cancelable: true,
					dataTransfer: dt,
				}),
			);

			dropZone.dispatchEvent(
				new DragEvent("dragover", {
					bubbles: true,
					cancelable: true,
					dataTransfer: dt,
				}),
			);

			dropZone.dispatchEvent(
				new DragEvent("drop", {
					bubbles: true,
					cancelable: true,
					dataTransfer: dt,
				}),
			);
		},
		{ fileData: projectFiles },
	);

	await waitForUpload(page);
}

export async function uploadProject(
	browserName: "chromium" | "webkit" | "firefox",
	page: Page,
	project: ProjectName | ProjectFiles,
) {
	if (browserName === "chromium") {
		return await uploadWithDragAndDrop(page, project);
	} else {
		return await uploadWithFilePicker(page, project);
	}
}

/**
 * Drop additional files directly onto the file list panel after an initial upload.
 * Chromium-only (uses DataTransfer + DragEvent path).
 */
export async function uploadMoreToFileList(
	page: Page,
	project: ProjectName | ProjectFiles,
) {
	const projectFiles =
		typeof project === "string"
			? sampleProjects[project]
			: projectify(project);

	await page.evaluate(
		async ({ fileData }) => {
			const fileList = document.querySelector(".file-list");
			if (!fileList) throw new Error(".file-list not found");
			const dt = new DataTransfer();
			for (const path in fileData) {
				const { content, type } = fileData[path];
				const file = new File([content], path, { type });
				if (path.includes("/")) {
					Object.defineProperty(file, "webkitRelativePath", {
						value: path,
						writable: false,
					});
				}
				dt.items.add(file);
			}
			fileList.dispatchEvent(
				new DragEvent("dragenter", {
					bubbles: true,
					cancelable: true,
					dataTransfer: dt,
				}),
			);
			fileList.dispatchEvent(
				new DragEvent("dragover", {
					bubbles: true,
					cancelable: true,
					dataTransfer: dt,
				}),
			);
			fileList.dispatchEvent(
				new DragEvent("drop", {
					bubbles: true,
					cancelable: true,
					dataTransfer: dt,
				}),
			);
		},
		{ fileData: projectFiles },
	);

	await waitForUpload(page);
}
