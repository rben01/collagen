import { Page } from "@playwright/test";

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

const sampleProjects = (() => {
	type ProjectContents = Record<string, { content: string; type: string }>;
	const o: Record<string, ProjectContents> = {};

	const mimeTypes = {
		json: "application/json",
		jsonnet: "text/plain",
		png: "image/png",
		jpg: "image/jpg",
		jpeg: "image/jpg",
		txt: "text/plain",
	};

	for (const projectName in _sampleProjectContents) {
		o[projectName] = {};

		const projectContents =
			_sampleProjectContents[projectName as ProjectName];

		for (const path in projectContents) {
			const content: string = projectContents[path];

			const extn = path.match(/.+\.([^.]+)$/);
			const type =
				extn === null
					? mimeTypes.txt
					: (mimeTypes[extn[1]] ?? mimeTypes.txt);

			o[projectName][path] = { content, type };
		}
	}

	return o as unknown as Record<
		ProjectName,
		{ content: string; type: string }
	>;
})();

// =============================================================================
// Simple Upload Testing Utilities
// =============================================================================

/**
 * Test file picker upload by simulating browse button click and file selection
 */
export async function uploadWithFilePicker(page: Page, project: ProjectName) {
	const projectFiles = sampleProjects[project];

	// Click the browse button to trigger file picker
	await page.locator(".browse-btn").click();

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

	return { success: true, error: null };
}

/**
 * Test drag-and-drop upload by simulating drag and drop events on the drop zone
 */
export async function uploadWithDragAndDrop(
	page: Page,
	project: ProjectName | ProjectFiles,
) {
	const projectFiles =
		typeof project === "string" ? sampleProjects[project] : project;

	// Simulate drag and drop on the drop zone
	await page.evaluate(
		async ({ fileData }) => {
			const dropZone = document.querySelector(".drop-zone");
			if (!dropZone) {
				throw new Error("Drop zone not found");
			}

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

	// Wait for the upload to be processed (either success or error)
	await page.waitForSelector(".files-uploaded, .error-message", {
		timeout: 1500,
	});
}
