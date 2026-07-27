/**
 * Shared locators and assertions for the Collagen e2e suite.
 *
 * Two facts about the current UI drive almost everything in here:
 *
 * 1. `+page.svelte` renders *two* `SvgDisplay` instances: the full one in the
 *    right pane, and a compact one in the sidebar that is only shown while the
 *    text editor / image viewer is open. Both use `aria-label="Interactive SVG
 *    viewer"`, so an unscoped `getByLabel` is ambiguous. Always go through the
 *    enclosing region, which is uniquely named.
 * 2. The generated SVG is rendered inside an `<iframe title="Generated SVG">`
 *    whose src is a `data:image/svg+xml;base64,...` URL. It is a separate
 *    document, so the SVG's own nodes are only reachable via a frame locator.
 */

import {
	expect,
	type FrameLocator,
	type Locator,
	type Page,
} from "@playwright/test";

/** Root of `FileList.svelte`; also the app's drop target. */
export function fileListRegion(page: Page): Locator {
	return page.getByRole("region", { name: "File information" });
}

/**
 * The right-hand pane's SVG viewer.
 *
 * `exact` matters: the compact viewer's region is named "Generated SVG display
 * (compact)", which a substring match would also pick up.
 */
export function mainViewerPane(page: Page): Locator {
	return page.getByRole("region", {
		name: "Generated SVG display",
		exact: true,
	});
}

/**
 * The sidebar's compact SVG viewer.
 *
 * While no side viewer is open this region is `display: none`, which removes it
 * from the accessibility tree, so `getByRole` resolves to zero matches. That is
 * what makes `toHaveCount(0)` a meaningful "the compact viewer is gone" check.
 */
export function compactViewerPane(page: Page): Locator {
	return page.getByRole("region", { name: "Generated SVG display (compact)" });
}

/**
 * The text editor pane.
 *
 * `.first()` is required: `RightPane` labels its wrapper "Text editor" and
 * `TextEditor` labels its own root the same way, so the name matches twice. The
 * outer wrapper contains everything the tests need.
 */
export function textEditorPane(page: Page): Locator {
	return page.getByRole("region", { name: "Text editor" }).first();
}

export function imageViewerPane(page: Page): Locator {
	return page.getByRole("region", { name: "Image viewer" });
}

/** The focusable, gesture-handling viewer element inside a viewer pane. */
export function viewer(pane: Locator): Locator {
	return pane.getByLabel("Interactive SVG viewer");
}

/**
 * The element carrying the viewer's pan/zoom state as CSS custom properties.
 * The properties inherit down to `.viewer-media`, which is the element the
 * `transform` is actually applied to.
 */
export function viewerContent(pane: Locator): Locator {
	return pane.getByLabel("Viewer content");
}

/** The generated SVG's own document. */
export function svgDoc(pane: Locator): FrameLocator {
	return pane.frameLocator('iframe[title="Generated SVG"]');
}

/**
 * The error pane's message. Scope this to a pane: the main and compact viewers
 * both render one, and the hidden compact copy still matches a bare CSS lookup.
 */
export function errorMessage(pane: Locator): Locator {
	return pane.locator(".error-message");
}

/** The full viewer's control toolbar. Absent from the compact viewer. */
export function viewerToolbar(page: Page): Locator {
	return page.getByRole("toolbar", { name: "SVG viewer controls" });
}

export interface ViewerState {
	scale: number;
	panX: number;
	panY: number;
}

/**
 * Read the viewer's pan/zoom state off the inline style. This is the state the
 * component actually drives; `getComputedStyle(...).transform` on
 * `.viewer-media` reflects the same numbers but collapses to `none` whenever any
 * input is non-finite, which would silently mask bad values.
 */
export async function getViewerState(pane: Locator): Promise<ViewerState> {
	const style = (await viewerContent(pane).getAttribute("style")) ?? "";
	const readVar = (name: string) => {
		const match = style.match(new RegExp(`${name}:\\s*(-?[\\d.]+|NaN)`));
		return match ? Number(match[1]) : Number.NaN;
	};
	return {
		scale: readVar("--scale"),
		panX: readVar("--pan-x"),
		panY: readVar("--pan-y"),
	};
}

/** The zoom percentage shown in the viewer toolbar, as a number. */
export async function getZoomPercent(page: Page): Promise<number> {
	const text = await page.locator(".zoom-level").innerText();
	return Number(text.replace("%", ""));
}

/**
 * Drag inside the viewer by (dx, dy) using real mouse events.
 * Starts slightly off-centre so the drag never begins on a container edge.
 */
export async function dragViewer(
	page: Page,
	pane: Locator,
	dx: number,
	dy: number,
): Promise<void> {
	const box = await viewer(pane).boundingBox();
	expect(box, "viewer should have a bounding box").not.toBeNull();
	const startX = box!.x + box!.width / 2;
	const startY = box!.y + box!.height / 2;
	await page.mouse.move(startX, startY);
	await page.mouse.down();
	await page.mouse.move(startX + dx, startY + dy, { steps: 8 });
	await page.mouse.up();
}

/** Open a text file for editing by clicking its row in the file list. */
export async function openFileInEditor(
	page: Page,
	path: string,
): Promise<void> {
	await fileListRegion(page)
		.getByRole("button", { name: `Edit ${path}`, exact: true })
		.click();
	await expect(textEditorPane(page)).toBeVisible();
}

/**
 * The editable surface of the manifest editor.
 *
 * `TextEditor.svelte` mounts CodeMirror 6, so this is a `contenteditable` div
 * that CodeMirror exposes as `role="textbox"` — there is no `<textarea>`.
 */
export function editorTextbox(page: Page): Locator {
	return textEditorPane(page).getByRole("textbox");
}

/**
 * Replace the editor's contents.
 *
 * Callers asserting on the *result* must allow for the app's debounced persist
 * (~100ms) and, for failures, the additional 300ms error-display delay. Use a
 * retrying `expect` rather than a fixed wait.
 */
export async function setEditorText(page: Page, text: string): Promise<void> {
	await editorTextbox(page).fill(text);
}

/** The editor's current contents, as CodeMirror reports them. */
export async function getEditorText(page: Page): Promise<string> {
	return await editorTextbox(page).innerText();
}
