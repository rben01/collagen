/**
 * End-to-end tests for the drag-and-drop visual editor.
 *
 * Three things about this pane shape every test in here:
 *
 * 1. The drawing lives in `<iframe title="Design canvas contents">`, whose
 *    `srcdoc` is the generated SVG stamped with `data-clgn-path`. It is a
 *    separate document, so its nodes are only reachable through a frame
 *    locator — the same arrangement `helpers.ts` documents for the rendered
 *    viewer's `<iframe title="Generated SVG">`.
 * 2. That iframe is `pointer-events: none`. Gestures land on the `.canvas`
 *    container, which hit-tests through `iframe.contentDocument`. Real mouse
 *    events therefore work: `page.mouse` drives the container's
 *    `pointerdown` and the window's `pointermove`/`pointerup` exactly as a
 *    user's hand would, so nothing here is simulated.
 * 3. Canvas coordinates are the SVG's own user units. `toClient` converts one
 *    to a viewport point by the same linear mapping `CanvasViewport` uses
 *    (`viewBox` spans the iframe's box), which is what lets a test say "drag
 *    the shape at (105, 75) to (155, 115)" and mean it.
 *
 * Coordinates round-trip through integer client pixels, so a gesture lands
 * within about a pixel — two thirds of a user unit at these sizes. Position
 * assertions therefore go through {@link expectAttrNear} rather than demanding
 * an exact number. Everything that is not a gesture result is asserted exactly.
 */

import {
	expect,
	type FrameLocator,
	type Locator,
	type Page,
} from "@playwright/test";
import { test } from "./fixtures";
import { uploadProject, type ProjectFiles } from "./upload";
import {
	getEditorText,
	mainViewerPane,
	openFileInEditor,
	svgDoc,
	textEditorPane,
} from "./helpers";

// =============================================================================
// Projects
// =============================================================================

/** The artboard every project below uses, so one mapping serves them all. */
const VIEW_BOX = { width: 400, height: 300 };

/**
 * A plain JSON manifest: two shapes, no loops, nothing computed.
 *
 * JSON is the easy case for the editor — the syntax tree is the value tree —
 * which makes it the right vehicle for testing selection, dragging, drawing,
 * and the inspector without the loop machinery in the way.
 */
const STATIC_PROJECT: ProjectFiles = {
	"collagen.json": JSON.stringify(
		{
			attrs: { viewBox: "0 0 400 300" },
			children: [
				{
					tag: "rect",
					attrs: { x: 50, y: 40, width: 110, height: 70, fill: "#3b82f6" },
				},
				{
					tag: "circle",
					attrs: { cx: 300, cy: 200, r: 40, fill: "#f59e0b" },
				},
			],
		},
		null,
		2,
	),
};

/**
 * Two solid-colour PNGs, whose only interesting property is their shape.
 *
 * They are written out as base64 rather than generated because the assertions
 * about placement all turn on the intrinsic size, and a literal is the only
 * way to be sure what that is. 40×20 and 20×60 are deliberately unalike: both
 * are placed into the same 4:3 box below, so one has to letterbox and the
 * other has to pillarbox, which are the two branches of the fit.
 */
const WIDE_PNG = {
	base64:
		"iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAIAAABwJOjsAAAAJElEQVR42mPQzbo2IIhh1OJR" +
		"i0ctHrV41OJRi0ctHrV45FgMAHFmdN23uFIdAAAAAElFTkSuQmCC",
};
const TALL_PNG = {
	base64:
		"iVBORw0KGgoAAAANSUhEUgAAABQAAAA8CAIAAADpFA0BAAAAKUlEQVR42u3LMQ0AAAgDsBnC" +
		"IELRgwdemvRtpusssizLsizLsizL8se8vHj6S6SNsLQAAAAASUVORK5CYII=",
};

/**
 * {@link STATIC_PROJECT}, plus two images the manifest does not yet mention.
 *
 * Two of them, so nothing is chosen for the user: a project with exactly one
 * image chooses it, which would make the "nothing chosen" case unreachable.
 * `photos/tall.png` sits in a subfolder to pin down two separate things — the
 * picker shows the basename, and the manifest gets the whole path.
 */
const IMAGE_PROJECT: ProjectFiles = {
	...STATIC_PROJECT,
	"wide.png": WIDE_PNG,
	"photos/tall.png": TALL_PNG,
};

/** The same, with the one image that leaves the picker nothing to ask. */
const ONE_IMAGE_PROJECT: ProjectFiles = {
	...STATIC_PROJECT,
	"photos/tall.png": TALL_PNG,
};

/**
 * The box every placement drag draws, in user units: 200 by 150, so 4:3.
 *
 * It is clear of both of {@link STATIC_PROJECT}'s shapes — the rect ends at
 * y = 110 and the circle starts at x = 260 — so the press that begins the drag
 * lands on blank artboard, as a user reaching for empty space would.
 */
const DRAW_BOX = { from: [20, 130], to: [220, 280] } as const;

/** Where {@link DRAW_BOX}'s middle is, which is what a fitted image centres on. */
const DRAW_BOX_CENTRE = { x: 120, y: 205 } as const;

/**
 * One statically written rect, plus four circles from a single comprehension.
 *
 * `cx` is the expression `70 + i * 90`, which is the whole point: the editor
 * cannot overwrite it with a number, so a drag has to compose a `transform`
 * instead.
 */
const LOOP_PROJECT: ProjectFiles = {
	"collagen.jsonnet": `{
	attrs: { viewBox: "0 0 400 300" },
	children: [
		{ tag: "rect", attrs: { x: 50, y: 40, width: 110, height: 70, fill: "#3b82f6" } },
		{
			tag: "g",
			children: [
				{ tag: "circle", attrs: { cx: 70 + i * 90, cy: 210, r: 26, fill: "#f59e0b" } }
				for i in std.range(0, 3)
			],
		},
	],
}
`,
};

/**
 * Four circles from one comprehension, one computed attribute and three
 * literal ones.
 *
 * The mixture is the point. `cx` is written `70 + i * 90`, which is what the
 * properties panel has to show in place of the `160` the second instance
 * comes to; `cy`, `r` and `fill` are plain values, which is what a literal row
 * and its offer to be edited as code are for. The loop sits directly in
 * `children` rather than inside a `<g>`, so the four instances are
 * `children[0]` through `children[3]`.
 */
const EXPRESSION_PROJECT: ProjectFiles = {
	"collagen.jsonnet": `{
	attrs: { viewBox: "0 0 400 300" },
	children: [
		{ tag: "circle", attrs: { cx: 70 + i * 90, cy: 150, r: 26, fill: "#f59e0b" } }
		for i in std.range(0, 3)
	],
}
`,
};

/** What `70 + i * 90` comes to for each of the four, in user units. */
const FANNED_CX = [70, 160, 250, 340] as const;

/** The `cy` all four of them share, so a click can find any one of them. */
const FANNED_CY = 150;

/**
 * A manifest the editor refuses to edit.
 *
 * `std.objectFields` enumerates a tag object, so it would observe the marker
 * field provenance injects and the two evaluations would disagree. That trips
 * the analyzer's last gate, which is exactly the condition this project exists
 * to exercise — the manifest itself is perfectly valid Collagen.
 */
const OPAQUE_PROJECT: ProjectFiles = {
	"collagen.jsonnet": `local box = {
	tag: "rect",
	attrs: { x: 40, y: 40, width: 120, height: 80, fill: "#3b82f6" },
};
{
	attrs: { viewBox: "0 0 400 300" },
	children: [
		box,
		{
			tag: "text",
			attrs: { x: 40, y: 180, "font-size": 24 },
			children: std.join(",", std.objectFields(box)),
		},
	],
}
`,
};

/**
 * One shape of each kind the pointer and layer fixes care about.
 *
 * `<text>` earns its place twice over. It is a tag `resizeEdits` has no case
 * for, so it is what proves handles stay off an element that cannot be
 * resized; and its lone text child is a layer row whose `parentPath` is
 * `children[1]` rather than the root, which makes it the one row a top-level
 * sibling must never accept as a drop target.
 */
const POINTER_PROJECT: ProjectFiles = {
	"collagen.jsonnet": `{
	attrs: { viewBox: "0 0 400 300" },
	children: [
		{ tag: "rect", attrs: { x: 40, y: 30, width: 120, height: 70, fill: "#3b82f6" } },
		{ tag: "text", attrs: { x: 200, y: 130, "font-size": 26, fill: "#111827" }, children: "Collagen" },
		{ tag: "circle", attrs: { cx: 300, cy: 220, r: 40, fill: "#f59e0b" } },
	],
}
`,
};

/** The middle of {@link POINTER_PROJECT}'s rect, which spans (40, 30)–(160, 100). */
const RECT_CENTRE = [100, 65] as const;

/**
 * Which layer row is which, once {@link POINTER_PROJECT} is a tree.
 *
 * Rows 0, 1 and 3 are the top-level siblings. Row 2 is the `<text>`'s own text
 * child, one level down. Dragging between the wrong pair of these is how a
 * reordering test passes without testing anything.
 */
const ROW = { rect: 0, text: 1, textChild: 2, circle: 3 } as const;

/** The row labels {@link POINTER_PROJECT} starts with, top to bottom. */
const POINTER_LAYERS = ["<rect>", "<text>", '"Collagen"', "<circle>"];

// =============================================================================
// Locators
// =============================================================================

/** The `[visual | rendered]` toggle above the right pane. */
function modeBar(page: Page): Locator {
	return page.getByRole("group", { name: "Editing mode" });
}

/**
 * Scoping the mode buttons to the toggle is required, not tidiness: the pane
 * they open is a region named "Visual editor" too, so an unscoped `getByLabel`
 * matches both the button and the region it reveals.
 */
function visualModeButton(page: Page): Locator {
	return modeBar(page).getByLabel("Visual editor");
}

function renderedModeButton(page: Page): Locator {
	return modeBar(page).getByLabel("Rendered output");
}

function visualEditorPane(page: Page): Locator {
	return page.getByRole("region", { name: "Visual editor" });
}

function designCanvas(page: Page): Locator {
	return page.getByRole("application", { name: "Design canvas" });
}

/** The artboard element itself, for measuring where user units land. */
function artboard(page: Page): Locator {
	return page.getByTitle("Design canvas contents");
}

/** The drawing's own document. */
function canvasDoc(page: Page): FrameLocator {
	return page.frameLocator('iframe[title="Design canvas contents"]');
}

/** The rendered element a manifest path names. Root is `data-clgn-path=""`. */
function elementAt(page: Page, path: string): Locator {
	return canvasDoc(page).locator(`[data-clgn-path="${path}"]`);
}

/**
 * The outline drawn around the selection.
 *
 * Decorative, with no role and no label, so a CSS selector is the only handle
 * on it — and it is needed: resize handles are drawn inside this outline, so
 * "no handles" would pass just as happily when nothing at all is selected.
 */
function selectionOutline(page: Page): Locator {
	return designCanvas(page).locator(".outline.selected");
}

/**
 * The dashed outline drawn around whatever the pointer is over.
 *
 * Decorative like the selection outline, and the only thing on screen that
 * says which element the editor considers hovered.
 */
function hoverOutline(page: Page): Locator {
	return designCanvas(page).locator(".outline.hover");
}

/** Every resize handle, by the label each one carries. */
const RESIZE_HANDLES = [
	"Resize nw",
	"Resize ne",
	"Resize sw",
	"Resize se",
] as const;

function toolButton(page: Page, name: string): Locator {
	return page.getByRole("toolbar", { name: "Drawing tools" }).getByLabel(name);
}

function layersTree(page: Page): Locator {
	return page.getByRole("tree", { name: "Layers" });
}

function layerRows(page: Page): Locator {
	return layersTree(page).getByRole("treeitem");
}

/** Rows badged as sharing a source construct with `size - 1` others. */
function sharedSourceBadges(page: Page, size: number): Locator {
	return page.getByTitle(`One of ${size} elements from the same source`);
}

/**
 * One attribute field in the properties panel.
 *
 * `exact` is required: every row also carries a "Remove <key>" button, and a
 * substring match would claim both.
 */
function attributeInput(page: Page, key: string): Locator {
	return page.getByLabel(key, { exact: true });
}

/**
 * The `= 160` beside an expression, saying what it comes to for the instance
 * that is selected.
 *
 * It is a reading rather than a control, so it carries no role and no label
 * and its title is the only handle on it. Scoped to the panel because a title
 * is a tooltip, and tooltips are not unique by construction.
 */
function evaluatedBadge(page: Page): Locator {
	return inspectorPanel(page).getByTitle("What it comes to here");
}

/** The toggle that turns one literal attribute's row into a code field. */
function asCodeToggle(page: Page, key: string): Locator {
	return page.getByLabel(`Edit ${key} as an expression`);
}

/**
 * The image picker, which stands in for the Inspector while the Image tool is
 * up.
 *
 * Neither panel carries a role or a label of its own, so a class is the only
 * handle on either — and *which of the two is on screen* is the whole subject
 * of several tests below, so "the picker is visible" has to be distinguishable
 * from "the Inspector is visible" rather than inferred from what is inside it.
 */
function imagePicker(page: Page): Locator {
	return visualEditorPane(page).locator(".picker");
}

function inspectorPanel(page: Page): Locator {
	return visualEditorPane(page).locator(".inspector");
}

/** Every image the picker is offering, in the order it lists them. */
function imageChoices(page: Page): Locator {
	return imagePicker(page).getByRole("button");
}

/**
 * One image in the picker, by its project-relative path.
 *
 * The path is the button's `title`, and it is the only thing about a row that
 * is certainly unique: what the row *shows* is the basename, and two images in
 * different folders can share one.
 */
function imageChoice(page: Page, path: string): Locator {
	return imagePicker(page).getByTitle(path);
}

// =============================================================================
// Actions
// =============================================================================

async function openVisualEditor(page: Page): Promise<void> {
	await visualModeButton(page).click();
	await expect(designCanvas(page)).toBeVisible();
	// The artboard is sized from the container's measured box, so it has no
	// size at all until the pane has laid out. Waiting for the root element
	// means both the frame's document and its geometry are ready.
	await expect(artboard(page)).toBeVisible();
	await expect(elementAt(page, "")).toBeAttached();
}

/** Where a point in the SVG's user units sits in the viewport. */
async function toClient(
	page: Page,
	ux: number,
	uy: number,
): Promise<{ x: number; y: number }> {
	const box = await artboard(page).boundingBox();
	expect(box, "the artboard should have a bounding box").not.toBeNull();
	return {
		x: box!.x + (ux / VIEW_BOX.width) * box!.width,
		y: box!.y + (uy / VIEW_BOX.height) * box!.height,
	};
}

/**
 * Press and travel between two points in the SVG's user units, leaving the
 * button down.
 *
 * Split out of {@link dragOnCanvas} for the tests that measure what letting go
 * looks like: those have to do the releasing themselves, inside the page.
 */
async function beginDragOnCanvas(
	page: Page,
	from: readonly [number, number],
	to: readonly [number, number],
): Promise<void> {
	const start = await toClient(page, from[0], from[1]);
	const end = await toClient(page, to[0], to[1]);
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(end.x, end.y, { steps: 8 });
}

/** Press, drag, and release between two points in the SVG's user units. */
async function dragOnCanvas(
	page: Page,
	from: readonly [number, number],
	to: readonly [number, number],
): Promise<void> {
	await beginDragOnCanvas(page, from, to);
	await page.mouse.up();
}

/**
 * Press a resize handle and travel a number of client pixels, leaving the
 * button down. The grip is taken by the handle's own box, because grabbing the
 * handle is what a user does.
 *
 * Pixels rather than user units, and for a sharper reason than
 * {@link pressAndTravel}'s. The two ends of this gesture are found by
 * different routes: the grip by the page's own drawing of the corner, the
 * destination by {@link toClient}'s arithmetic. Those disagree by a few pixels
 * -- the drawing inside the frame is inset by the document's own margin, which
 * a linear mapping across the whole frame cannot see -- and on a thirty-unit
 * drag the gap is most of a tolerance. Measuring the travel in pixels at both
 * ends closes it.
 */
async function beginResizeTravel(
	page: Page,
	handle: (typeof RESIZE_HANDLES)[number],
	dxPixels: number,
	dyPixels: number,
): Promise<void> {
	const grip = await page.getByLabel(handle).boundingBox();
	expect(
		grip,
		`the ${handle} handle should have a bounding box`,
	).not.toBeNull();
	const x = Math.round(grip!.x + grip!.width / 2);
	const y = Math.round(grip!.y + grip!.height / 2);
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + dxPixels, y + dyPixels, { steps: 8 });
}

/** A box measured inside the canvas frame, in that document's own pixels. */
interface FrameBox {
	left: number;
	right: number;
	top: number;
	bottom: number;
	width: number;
	height: number;
}

/**
 * Where a drawn element sits right now, measured inside the canvas frame.
 *
 * Everything else in this file measures through Playwright, in page
 * coordinates. This cannot: it is the "before" of a comparison whose other two
 * readings are taken inside the page, by {@link releaseAndSample}, and two
 * coordinate systems separated by the frame's offset would not compare.
 */
function edgesInFrame(page: Page, path: string): Promise<FrameBox> {
	return artboard(page).evaluate((frame, target) => {
		const element = (
			frame as HTMLIFrameElement
		).contentDocument?.querySelector(`[data-clgn-path="${target}"]`);
		if (!element) throw new Error(`Nothing is drawn at ${target}.`);
		return element.getBoundingClientRect().toJSON() as FrameBox;
	}, path);
}

/**
 * Release the drag in flight, reading where the element sits either side of
 * the release without yielding in between.
 *
 * The window this exists to measure is the one between letting go and the
 * regenerated drawing arriving -- a write, an evaluation, and a frame reload,
 * a few tens of milliseconds all told. Sampling it from the test side cannot
 * work: every round trip is a task boundary, and a pane the browser considers
 * hidden throttles timers and animation frames until the window has already
 * closed. So the release and both readings happen together, in one task,
 * inside the page. `getBoundingClientRect` forces layout, so the reading taken
 * straight after `pointerup` is of a settled box rather than a stale one.
 *
 * The release is the only synthesized event; the press and the travel before
 * it are real input, as everywhere else here. `page.mouse.up()` cannot stand in
 * for it because it returns over the wire, by which time the drawing may
 * already have been replaced -- and the caller still has to send it afterwards,
 * since the real button is genuinely still down.
 */
function releaseAndSample(
	page: Page,
	path: string,
): Promise<{ during: FrameBox; after: FrameBox; transform: string }> {
	return artboard(page).evaluate((frame, target) => {
		const element = (
			frame as HTMLIFrameElement
		).contentDocument?.querySelector(`[data-clgn-path="${target}"]`);
		if (!element) throw new Error(`Nothing is drawn at ${target}.`);

		const during = element.getBoundingClientRect().toJSON() as FrameBox;
		window.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }),
		);
		return {
			during,
			after: element.getBoundingClientRect().toJSON() as FrameBox,
			transform: (element as SVGElement).style.transform,
		};
	}, path);
}

/** Screen pixels per SVG user unit, which is the currency of the threshold. */
async function pixelsPerUnit(page: Page): Promise<number> {
	const box = await artboard(page).boundingBox();
	expect(box, "the artboard should have a bounding box").not.toBeNull();
	return box!.width / VIEW_BOX.width;
}

/**
 * Press at a point in user units, travel a whole number of client pixels, and
 * leave the button down. Returns where the pointer ended up.
 *
 * {@link dragOnCanvas} speaks user units, which is the right currency for "put
 * that shape here". The drag threshold is measured in client pixels, so probing
 * it needs the other one. The press point is rounded to whole pixels first, so
 * the offset the page sees is exactly the one asked for rather than one either
 * side of it once Chromium quantizes the coordinates.
 */
async function pressAndTravel(
	page: Page,
	at: readonly [number, number],
	dxPixels: number,
	dyPixels: number,
): Promise<{ x: number; y: number }> {
	const point = await toClient(page, at[0], at[1]);
	const x = Math.round(point.x);
	const y = Math.round(point.y);
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + dxPixels, y + dyPixels);
	return { x: x + dxPixels, y: y + dyPixels };
}

/** One HTML5 drag event, aimed at a layer row by its position in the tree. */
type LayerDragStep = [type: string, row: number];

/**
 * Dispatch HTML5 drag events at layer rows.
 *
 * Everything else in this file drives real input through `page.mouse`, on
 * purpose. This cannot: HTML5 drag and drop is a second event stream the
 * browser synthesizes from a native drag session, and no mouse API can abandon
 * one halfway — firing `dragstart` with no `drop` is exactly the case the panel
 * used to get wrong, so it has to be reachable. The events land on the real
 * rows and the panel's own handlers run unmodified; what is *not* exercised is
 * the browser's own session, so the drag image and the `dropEffect`
 * negotiation are assumed to work.
 *
 * Each call carries its own `DataTransfer` because the panel never reads one.
 * Threading a shared object between calls would add page-global state to buy
 * nothing.
 */
async function fireLayerDrag(
	page: Page,
	steps: LayerDragStep[],
): Promise<void> {
	await page.evaluate(sequence => {
		const rows = document.querySelectorAll('[role="treeitem"]');
		const transfer = new DataTransfer();
		for (const [type, index] of sequence) {
			const row = rows[index];
			if (!row) throw new Error(`No layer row at index ${index}.`);
			row.dispatchEvent(
				new DragEvent(type, {
					bubbles: true,
					cancelable: true,
					dataTransfer: transfer,
				}),
			);
		}
	}, steps);
}

/** Click a point in the SVG's user units. */
async function clickOnCanvas(
	page: Page,
	ux: number,
	uy: number,
): Promise<void> {
	const point = await toClient(page, ux, uy);
	await page.mouse.move(point.x, point.y);
	await page.mouse.down();
	await page.mouse.up();
}

/**
 * Pick up the Image tool and choose one of the project's images.
 *
 * The wait for the size to appear is load-bearing, not tidiness. `fitInside`
 * is handed the intrinsic size the picker measured, and deliberately falls
 * back to the box exactly as drawn when the browser has not decoded the file
 * yet — so a drag that outran the decode would quietly exercise the fallback
 * and the proportions assertions would be testing nothing. It has to come
 * *after* the click, too: choosing rebuilds the list, which restarts every
 * thumbnail's load.
 */
async function chooseImage(
	page: Page,
	path: string,
	size: string,
): Promise<void> {
	await toolButton(page, "Image").click();
	await expect(imagePicker(page)).toBeVisible();

	const choice = imageChoice(page, path);
	await choice.click();
	await expect(choice).toHaveAttribute("aria-pressed", "true");
	await expect(choice).toContainText(size, { timeout: 10000 });
}

/** Draw {@link DRAW_BOX} on the canvas with whatever tool is up. */
async function drawTheBox(page: Page): Promise<void> {
	await dragOnCanvas(page, DRAW_BOX.from, DRAW_BOX.to);
}

/**
 * The manifest's current text, read back through the app's own text editor.
 *
 * Opening a file replaces the right pane, so the visual editor is restored
 * afterwards and the caller can carry on. The selection survives the trip: it
 * lives on the page's `EditorState`, not inside the editor component.
 */
async function manifestSource(page: Page, path: string): Promise<string> {
	await openFileInEditor(page, path);
	const text = await getEditorText(page);
	await textEditorPane(page)
		.getByRole("button", { name: "Close editor" })
		.click();
	await expect(designCanvas(page)).toBeVisible();
	return text;
}

// =============================================================================
// Assertions
// =============================================================================

/**
 * Wait for a numeric attribute to settle within `tolerance` of `expected`.
 *
 * Polling is what makes this safe against the regeneration that follows every
 * edit: the drawing is rebuilt asynchronously, so the old value is briefly
 * still on screen. On failure the raw attribute is reported rather than a
 * boolean, so a wrong number reads as a wrong number.
 */
async function expectAttrNear(
	locator: Locator,
	name: string,
	expected: number,
	tolerance = 1.5,
): Promise<void> {
	await expect
		.poll(
			async () => {
				const raw = await locator.getAttribute(name);
				const value = Number(raw);
				return Number.isFinite(value) &&
					Math.abs(value - expected) <= tolerance
					? expected
					: raw;
			},
			{
				timeout: 10000,
				message: `${name} should settle within ${tolerance} of ${expected}`,
			},
		)
		.toBe(expected);
}

/**
 * Wait for a placed image to settle on the box the fit should have chosen.
 *
 * The four numbers go through {@link expectAttrNear}, which allows the pixel
 * of slack every gesture in this file carries — and because the expected `x`
 * and `y` are the *centred* ones, passing them is also what says the image was
 * centred rather than pinned to a corner.
 *
 * The ratio is then checked far more tightly. It does not depend on where the
 * drag landed, only on whether the proportions survived at all, so the same
 * slack there would let through exactly the failure this exists to catch: the
 * drawn box is 4:3, and both images placed into it are emphatically not.
 */
async function expectFittedImage(
	image: Locator,
	expected: { x: number; y: number; width: number; height: number },
): Promise<void> {
	await expectAttrNear(image, "width", expected.width);
	await expectAttrNear(image, "height", expected.height);
	await expectAttrNear(image, "x", expected.x);
	await expectAttrNear(image, "y", expected.y);

	const width = Number(await image.getAttribute("width"));
	const height = Number(await image.getAttribute("height"));
	expect(
		width / height,
		"the placed image should keep its proportions",
	).toBeCloseTo(expected.width / expected.height, 2);
}

/**
 * Wait for the canvas to settle on a cursor.
 *
 * The cursor is the whole of the affordance: nothing else on screen says a
 * shape can be dragged or the canvas can be grabbed. It comes from a class the
 * component toggles, so it is read back as computed style rather than as a
 * class name, which is what a user would see.
 */
async function expectCursor(page: Page, expected: string): Promise<void> {
	await expect
		.poll(() => canvasCursor(page), {
			message: `the canvas cursor should be ${expected}`,
		})
		.toBe(expected);
}

/** The canvas's cursor right now, with no waiting. */
function canvasCursor(page: Page): Promise<string> {
	return designCanvas(page).evaluate(
		element => getComputedStyle(element).cursor,
	);
}

/**
 * Wait for two elements to settle on the same box, within `tolerance` pixels.
 *
 * This is how an overlay drawn *around* something is checked to be around the
 * thing it claims: the outline carries no identity of its own, so the only
 * evidence of which element it is highlighting is where it is. Both boxes are
 * re-measured on every poll, because the drawing is rebuilt asynchronously
 * after an edit and the two settle a frame apart. On failure both boxes are
 * reported, so a highlight on the wrong element reads as the wrong box.
 */
async function expectBoxesMatch(
	outline: Locator,
	element: Locator,
	tolerance = 2,
): Promise<void> {
	const describe = (box: {
		x: number;
		y: number;
		width: number;
		height: number;
	}) =>
		`(${box.x.toFixed(1)}, ${box.y.toFixed(1)}) ${box.width.toFixed(1)}×${box.height.toFixed(1)}`;

	await expect
		.poll(
			async () => {
				const box = await outline.boundingBox();
				const target = await element.boundingBox();
				if (!box) return "the outline has no box";
				if (!target) return "the element has no box";
				const off = Math.max(
					Math.abs(box.x - target.x),
					Math.abs(box.y - target.y),
					Math.abs(box.width - target.width),
					Math.abs(box.height - target.height),
				);
				return off <= tolerance
					? "the same box"
					: `outline ${describe(box)}, element ${describe(target)}`;
			},
			{ timeout: 10000, message: "the outline should sit on the element" },
		)
		.toBe("the same box");
}

/** Wait for the layer rows to read, top to bottom, exactly like this. */
async function expectLayerOrder(
	page: Page,
	labels: readonly string[],
): Promise<void> {
	await expect(layerRows(page)).toHaveCount(labels.length);
	for (let i = 0; i < labels.length; i++) {
		await expect(layerRows(page).nth(i)).toContainText(labels[i], {
			timeout: 10000,
		});
	}
}

/** The horizontal position of each of a locator's `count` matches. */
async function leftEdges(locator: Locator, count: number): Promise<number[]> {
	const edges: number[] = [];
	for (let i = 0; i < count; i++) {
		const box = await locator.nth(i).boundingBox();
		expect(box, `element ${i} should have a bounding box`).not.toBeNull();
		edges.push(box!.x);
	}
	return edges;
}

test.use({ viewport: { width: 1280, height: 900 } });

// =============================================================================
// Mode toggle
// =============================================================================

test.describe("Editing mode toggle", () => {
	test("is absent until files are loaded", async ({ page }) => {
		await expect(modeBar(page)).toHaveCount(0);
		await expect(mainViewerPane(page)).toBeVisible();
	});

	test("appears once files load and switches the right pane", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, STATIC_PROJECT);

		await expect(modeBar(page)).toBeVisible();
		await expect(visualModeButton(page)).toBeVisible();
		await expect(renderedModeButton(page)).toBeVisible();
		// Rendered output is where the app starts.
		await expect(mainViewerPane(page)).toBeVisible();
		await expect(designCanvas(page)).toHaveCount(0);

		await openVisualEditor(page);
		await expect(visualEditorPane(page)).toBeVisible();
		await expect(
			page.getByRole("toolbar", { name: "Drawing tools" }),
		).toBeVisible();
		await expect(layersTree(page)).toBeVisible();
		await expect(mainViewerPane(page)).toHaveCount(0);

		await renderedModeButton(page).click();
		await expect(mainViewerPane(page)).toBeVisible();
		await expect(designCanvas(page)).toHaveCount(0);
		// The toggle stays reachable from both sides.
		await expect(visualModeButton(page)).toBeVisible();
	});

	test("offers every drawing tool", async ({ page, browserName }) => {
		await uploadProject(browserName, page, STATIC_PROJECT);
		await openVisualEditor(page);

		for (const name of [
			"Select",
			"Rectangle",
			"Ellipse",
			"Line",
			"Text",
			"Image",
			"Pan",
		]) {
			await expect(toolButton(page, name)).toBeVisible();
		}
	});
});

// =============================================================================
// Selection
// =============================================================================

test.describe("Selecting on the canvas", () => {
	test.beforeEach(async ({ page, browserName }) => {
		await uploadProject(browserName, page, STATIC_PROJECT);
		await openVisualEditor(page);
	});

	test("starts with nothing selected", async ({ page }) => {
		await expect(layerRows(page)).toHaveCount(2);
		await expect(layerRows(page).nth(0)).toHaveAttribute(
			"aria-selected",
			"false",
		);
		await expect(layerRows(page).nth(1)).toHaveAttribute(
			"aria-selected",
			"false",
		);
		await expect(
			page.getByText("Select something on the canvas."),
		).toBeVisible();
	});

	test("clicking a shape selects its layer row and shows its attributes", async ({
		page,
	}) => {
		// The rect spans (50, 40) to (160, 110); this is its middle.
		await clickOnCanvas(page, 105, 75);

		await expect(layerRows(page).nth(0)).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(layerRows(page).nth(1)).toHaveAttribute(
			"aria-selected",
			"false",
		);

		await expect(
			page.getByRole("heading", { name: "Geometry" }),
		).toBeVisible();
		await expect(page.getByRole("heading", { name: "Fill" })).toBeVisible();
		await expect(attributeInput(page, "x")).toHaveValue("50");
		await expect(attributeInput(page, "y")).toHaveValue("40");
		await expect(attributeInput(page, "width")).toHaveValue("110");
		await expect(attributeInput(page, "height")).toHaveValue("70");
		await expect(attributeInput(page, "fill")).toHaveValue("#3b82f6");
	});

	test("clicking a second shape moves the selection to it", async ({
		page,
	}) => {
		await clickOnCanvas(page, 105, 75);
		await expect(attributeInput(page, "width")).toBeVisible();

		await clickOnCanvas(page, 300, 200);

		await expect(layerRows(page).nth(0)).toHaveAttribute(
			"aria-selected",
			"false",
		);
		await expect(layerRows(page).nth(1)).toHaveAttribute(
			"aria-selected",
			"true",
		);
		// The circle's own attributes, and none of the rect's.
		await expect(attributeInput(page, "cx")).toHaveValue("300");
		await expect(attributeInput(page, "cy")).toHaveValue("200");
		await expect(attributeInput(page, "r")).toHaveValue("40");
		await expect(attributeInput(page, "width")).toHaveCount(0);
	});

	test("clicking empty canvas clears the selection", async ({ page }) => {
		await clickOnCanvas(page, 105, 75);
		await expect(layerRows(page).nth(0)).toHaveAttribute(
			"aria-selected",
			"true",
		);

		// Nothing is drawn in the top-right corner of this artboard.
		await clickOnCanvas(page, 380, 20);

		await expect(layerRows(page).nth(0)).toHaveAttribute(
			"aria-selected",
			"false",
		);
		await expect(
			page.getByText("Select something on the canvas."),
		).toBeVisible();

		// The canvas has to agree with the panels. A press on blank artboard
		// resolves to the root `<svg>`, which is stamped like everything else,
		// so without care the selection becomes the document and handles stay
		// drawn around the whole drawing while both panels say nothing is
		// selected.
		await expect(page.getByLabel("Resize nw")).toHaveCount(0);
		await expect(page.getByLabel("Resize se")).toHaveCount(0);
	});
});

// =============================================================================
// Dragging a statically written shape
// =============================================================================

test.describe("Dragging a static shape", () => {
	test("rewrites its coordinates in both the drawing and the manifest", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, STATIC_PROJECT);
		await openVisualEditor(page);

		const rect = elementAt(page, "children[0]");
		await expect(rect).toHaveAttribute("x", "50");
		await expect(rect).toHaveAttribute("y", "40");

		// From the rect's middle, 50 right and 40 down.
		await dragOnCanvas(page, [105, 75], [155, 115]);

		await expectAttrNear(rect, "x", 100);
		await expectAttrNear(rect, "y", 80);
		// Position attributes are preferred over a transform when the author
		// wrote plain numbers, because those are what they will read back.
		await expect(rect).not.toHaveAttribute("transform", /.*/);

		// Whatever the drawing shows must be what the manifest says.
		const x = await rect.getAttribute("x");
		const y = await rect.getAttribute("y");
		const source = await manifestSource(page, "collagen.json");
		expect(source).toContain(`"x": ${x}`);
		expect(source).toContain(`"y": ${y}`);
		// Size is untouched by a move.
		expect(source).toContain(`"width": 110`);
		expect(source).toContain(`"height": 70`);
	});

	test("leaves the other shapes alone", async ({ page, browserName }) => {
		await uploadProject(browserName, page, STATIC_PROJECT);
		await openVisualEditor(page);

		await dragOnCanvas(page, [105, 75], [155, 115]);
		await expectAttrNear(elementAt(page, "children[0]"), "x", 100);

		const circle = elementAt(page, "children[1]");
		await expect(circle).toHaveAttribute("cx", "300");
		await expect(circle).toHaveAttribute("cy", "200");
	});
});

// =============================================================================
// Letting go of a drag
// =============================================================================

/*
 * Releasing used to clear the preview transform there and then. The real change
 * is not on screen at that point -- it has to be spliced into the manifest,
 * written, evaluated, generated and loaded into the frame -- so for that whole
 * stretch the element was drawn back where the drag began: a visible jump
 * backwards before it landed. The preview now stays up until the regenerated
 * drawing replaces it, and is dropped at once only where no redraw is coming.
 *
 * Both halves need pinning. A "fix" that never cleared the preview would pass
 * the first two tests below and leave a refused drag showing the user a
 * position the document does not hold, permanently; the third is what says so.
 */

test.describe("Letting go of a drag", () => {
	test("a released move stays where it was dropped", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, STATIC_PROJECT);
		await openVisualEditor(page);

		const rect = elementAt(page, "children[0]");
		const before = await edgesInFrame(page, "children[0]");

		// From the rect's middle, 60 right and 40 down.
		await beginDragOnCanvas(page, [105, 75], [165, 115]);
		// Waiting for the preview is what makes the reading below meaningful:
		// a sample taken before the drag had previewed anything would compare
		// two identical boxes and call it a pass.
		await expect(rect).toHaveAttribute("style", /translate/);

		const sample = await releaseAndSample(page, "children[0]");
		await page.mouse.up();

		expect(
			sample.during.left,
			"the drag should have previewed the move",
		).toBeGreaterThan(before.left + 20);
		// The whole of the regression: this reading is of the very frame the
		// release produced, and the element must still be under the cursor
		// rather than back at `before.left`.
		expect(
			sample.after.left,
			"the element should not snap back on release",
		).toBeCloseTo(sample.during.left, 3);
		expect(
			sample.transform,
			"the preview should still be up, holding the element there",
		).toMatch(/translate/);

		// It is a preview and not the answer, though: once the regenerated
		// drawing lands it carries the committed coordinates, with nothing left
		// over on top of them.
		await expectAttrNear(rect, "x", 110);
		await expectAttrNear(rect, "y", 80);
		await expect(rect).not.toHaveAttribute("style", /translate/);
	});

	test("a released resize stays at the size it was dragged to", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, STATIC_PROJECT);
		await openVisualEditor(page);

		const rect = elementAt(page, "children[0]");
		await clickOnCanvas(page, 105, 75);
		await expect(selectionOutline(page)).toBeVisible();
		const perUnit = await pixelsPerUnit(page);
		const before = await edgesInFrame(page, "children[0]");

		// The rect spans (50, 40) to (160, 110). Its south-east corner travels
		// 60 pixels right and 45 down, which anchors the north-west one and
		// grows the box by about 40 units by 30.
		await beginResizeTravel(page, "Resize se", 60, 45);
		await expect(rect).toHaveAttribute("style", /scale/);

		const sample = await releaseAndSample(page, "children[0]");
		await page.mouse.up();

		// The right edge, not the left: a resize previews by scaling about the
		// corner that stays put, so the corner that was dragged is the only one
		// that moved and the only one a snap back would take with it.
		expect(
			sample.during.right,
			"the drag should have previewed the resize",
		).toBeGreaterThan(before.right + 20);
		expect(
			sample.after.right,
			"the element should not snap back to its old size on release",
		).toBeCloseTo(sample.during.right, 3);
		expect(
			sample.transform,
			"the preview should still be up, holding the element at that size",
		).toMatch(/scale/);

		await expectAttrNear(rect, "width", 110 + 60 / perUnit);
		await expectAttrNear(rect, "height", 70 + 45 / perUnit);
		// Anchored, not moved.
		await expectAttrNear(rect, "x", 50);
		await expectAttrNear(rect, "y", 40);
		await expect(rect).not.toHaveAttribute("style", /scale/);
	});

	test("a refused move drops its preview at once, no redraw being due", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, OPAQUE_PROJECT);
		await openVisualEditor(page);

		const rect = elementAt(page, "children[0]");
		const before = await edgesInFrame(page, "children[0]");

		// This manifest cannot be written back to, so the drag will be refused
		// and nothing will be regenerated. A preview held here would be held
		// for good, showing a position the document does not hold.
		await beginDragOnCanvas(page, [100, 80], [160, 130]);
		await expect(rect).toHaveAttribute("style", /translate/);

		const sample = await releaseAndSample(page, "children[0]");
		await page.mouse.up();

		expect(
			sample.during.left,
			"the drag should have previewed the move",
		).toBeGreaterThan(before.left + 20);
		expect(
			sample.after.left,
			"a refused move should let go of its preview at once",
		).toBeCloseTo(before.left, 3);
		expect(sample.transform).toBe("");

		await expect(
			page.getByText("This element cannot be edited here. Edit it as text."),
		).toBeVisible();
		await expect(rect).toHaveAttribute("x", "40");
		await expect(rect).toHaveAttribute("y", "40");
	});
});

// =============================================================================
// Loops
// =============================================================================

test.describe("Elements a loop produced", () => {
	/** Where the loop's four circles sit, in user units. */
	const CIRCLES = [
		[70, 210],
		[160, 210],
		[250, 210],
		[340, 210],
	] as const;

	test.beforeEach(async ({ page, browserName }) => {
		await uploadProject(browserName, page, LOOP_PROJECT);
		await openVisualEditor(page);
		await expect(canvasDoc(page).locator("circle")).toHaveCount(4);
	});

	test("badges every element that shares the loop's source", async ({
		page,
	}) => {
		// rect, g, and the g's four circles.
		await expect(layerRows(page)).toHaveCount(6);

		const badges = sharedSourceBadges(page, 4);
		await expect(badges).toHaveCount(4);
		for (let i = 0; i < 4; i++) {
			await expect(badges.nth(i)).toHaveText("↻4");
		}

		// The statically written rect shares its source with nothing.
		await expect(layerRows(page).nth(0)).toContainText("<rect>");
		await expect(
			layerRows(page)
				.nth(0)
				.getByTitle(/same source/),
		).toHaveCount(0);
	});

	test("warns that editing one changes all of them", async ({ page }) => {
		await clickOnCanvas(page, CIRCLES[0][0], CIRCLES[0][1]);

		await expect(
			page.getByText(
				"One of 4 elements a loop produced. Editing changes all of them.",
			),
		).toBeVisible();
		await expect(page.getByLabel("Detach this element")).toBeVisible();
	});

	test("shows no such warning for a shape outside the loop", async ({
		page,
	}) => {
		await clickOnCanvas(page, 105, 75);

		await expect(attributeInput(page, "width")).toHaveValue("110");
		await expect(page.getByText(/One of \d+ elements/)).toHaveCount(0);
		await expect(page.getByLabel("Detach this element")).toHaveCount(0);
	});

	test("dragging one moves all four, and the loop survives", async ({
		page,
	}) => {
		const circles = canvasDoc(page).locator("circle");
		const before = await leftEdges(circles, 4);

		// 30 right and 30 down, starting from the first circle's centre.
		await dragOnCanvas(page, [CIRCLES[0][0], CIRCLES[0][1]], [100, 240]);

		// `cx` is the expression `70 + i * 90`, so the editor cannot overwrite
		// it. It composes a transform instead, and that lands on the shared loop
		// body — which is why all four move.
		for (let i = 0; i < 4; i++) {
			await expect(circles.nth(i)).toHaveAttribute(
				"transform",
				/^translate\(/,
				{ timeout: 10000 },
			);
		}
		await expect(circles.nth(0)).toHaveAttribute("cx", "70");

		const after = await leftEdges(circles, 4);
		for (let i = 0; i < 4; i++) {
			expect(
				after[i] - before[i],
				`circle ${i} should have moved right`,
			).toBeGreaterThan(20);
		}

		const source = await manifestSource(page, "collagen.jsonnet");
		expect(source).toContain("for i in std.range(0, 3)");
		expect(source).toContain("cx: 70 + i * 90");
		expect(source).toContain("transform:");
		// One transform, written once, into the one loop body.
		expect(source.match(/transform:/g)).toHaveLength(1);
	});

	test("detaching expands the loop into four literal elements", async ({
		page,
	}) => {
		await clickOnCanvas(page, CIRCLES[0][0], CIRCLES[0][1]);
		await page.getByLabel("Detach this element").click();

		// Nothing shares a source any more, so no row is badged.
		await expect(sharedSourceBadges(page, 4)).toHaveCount(0, {
			timeout: 10000,
		});
		await expect(layerRows(page)).toHaveCount(6);
		await expect(canvasDoc(page).locator("circle")).toHaveCount(4);

		const source = await manifestSource(page, "collagen.jsonnet");
		expect(source).not.toContain("for i in std.range");
		expect(source).not.toContain("70 + i * 90");
		for (const cx of [70, 160, 250, 340]) {
			expect(source).toContain(`cx: ${cx}`);
		}
	});

	test("after detaching, dragging one moves only that one", async ({
		page,
	}) => {
		await clickOnCanvas(page, CIRCLES[0][0], CIRCLES[0][1]);
		await page.getByLabel("Detach this element").click();
		await expect(sharedSourceBadges(page, 4)).toHaveCount(0, {
			timeout: 10000,
		});

		await dragOnCanvas(page, [CIRCLES[0][0], CIRCLES[0][1]], [100, 240]);

		// The dragged circle now has a literal `cx`, so it moves by that.
		const first = elementAt(page, "children[1].children[0]");
		await expectAttrNear(first, "cx", 100);
		await expectAttrNear(first, "cy", 240);
		await expect(first).not.toHaveAttribute("transform", /.*/);

		for (let i = 1; i < 4; i++) {
			const other = elementAt(page, `children[1].children[${i}]`);
			await expect(other).toHaveAttribute("cx", String(CIRCLES[i][0]));
			await expect(other).toHaveAttribute("cy", "210");
		}
	});
});

// =============================================================================
// Drawing
// =============================================================================

test.describe("Drawing a new shape", () => {
	test.beforeEach(async ({ page, browserName }) => {
		await uploadProject(browserName, page, STATIC_PROJECT);
		await openVisualEditor(page);
	});

	test("the rectangle tool adds a rect at the dragged box", async ({
		page,
	}) => {
		await toolButton(page, "Rectangle").click();

		// From the artboard's centre to three quarters across and down.
		await dragOnCanvas(page, [200, 150], [300, 225]);

		const drawn = elementAt(page, "children[2]");
		await expect(drawn).toBeAttached({ timeout: 10000 });
		await expectAttrNear(drawn, "x", 200);
		await expectAttrNear(drawn, "y", 150);
		await expectAttrNear(drawn, "width", 100);
		await expectAttrNear(drawn, "height", 75);

		// It joins the layers tree, and becomes the selection.
		await expect(layerRows(page)).toHaveCount(3);
		await expect(layerRows(page).nth(2)).toContainText("<rect>");
		await expect(layerRows(page).nth(2)).toHaveAttribute(
			"aria-selected",
			"true",
		);

		const source = await manifestSource(page, "collagen.json");
		expect(source).toContain(`"x": ${await drawn.getAttribute("x")}`);
		expect(source).toContain(`"width": ${await drawn.getAttribute("width")}`);
		// A third child, appended after the two that were already there.
		expect(source.match(/"tag":\s*"rect"/g)).toHaveLength(2);
	});

	test("the tool reverts to Select once the shape is drawn", async ({
		page,
	}) => {
		await toolButton(page, "Rectangle").click();
		await dragOnCanvas(page, [200, 150], [300, 225]);
		await expect(elementAt(page, "children[2]")).toBeAttached({
			timeout: 10000,
		});

		// Proof by behaviour rather than by CSS class: the next press selects
		// what is under it instead of starting another rectangle.
		await clickOnCanvas(page, 105, 75);
		await expect(layerRows(page)).toHaveCount(3);
		await expect(layerRows(page).nth(0)).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(attributeInput(page, "width")).toHaveValue("110");
	});

	test("the ellipse tool adds an ellipse at the dragged box", async ({
		page,
	}) => {
		await toolButton(page, "Ellipse").click();
		await dragOnCanvas(page, [200, 150], [300, 225]);

		const drawn = elementAt(page, "children[2]");
		await expect(drawn).toBeAttached({ timeout: 10000 });
		// An ellipse is written by centre and radii, not by its corner.
		await expectAttrNear(drawn, "cx", 250);
		await expectAttrNear(drawn, "cy", 187.5);
		await expectAttrNear(drawn, "rx", 50);
		await expectAttrNear(drawn, "ry", 37.5);
	});

	test("a press with no drag draws nothing", async ({ page }) => {
		await toolButton(page, "Rectangle").click();
		await clickOnCanvas(page, 200, 150);

		// Proving a negative takes a positive after it. A real drag follows,
		// and lands as `children[2]` at its full size — which it could not do
		// if the press had already inserted a zero-area rect there, or had
		// switched the tool back to Select by drawing one.
		await dragOnCanvas(page, [200, 150], [300, 225]);

		const drawn = elementAt(page, "children[2]");
		await expect(drawn).toBeAttached({ timeout: 10000 });
		await expectAttrNear(drawn, "width", 100);
		await expect(layerRows(page)).toHaveCount(3);
		await expect(elementAt(page, "children[3]")).toHaveCount(0);
	});

	test("a press with a tremor draws nothing either", async ({ page }) => {
		const before = await manifestSource(page, "collagen.json");
		await toolButton(page, "Rectangle").click();

		// The test above travels zero pixels, which every implementation
		// refuses: the box comes out exactly 0 wide. These two do travel, and
		// are still inside the three-pixel threshold — a hand tremor, not a
		// drawing. The diagonal one matters most: it is the only one whose box
		// has a non-zero width *and* height, so it is the one that used to be
		// written out as a sliver rect.
		for (const [dx, dy] of [
			[1, 0],
			[2, 2],
		] as const) {
			await pressAndTravel(page, [200, 150], dx, dy);
			await page.mouse.up();

			await expect(layerRows(page)).toHaveCount(2);
			await expect(elementAt(page, "children[2]")).toHaveCount(0);
		}

		// Byte for byte: no sliver, and so no undo entry either.
		expect(await manifestSource(page, "collagen.json")).toBe(before);

		// The positive control. No tool button is clicked again first, so this
		// also says the tremors left the Rectangle tool selected — drawing a
		// shape is what reverts it, and nothing was drawn. (The tool survives
		// the trip through the text editor for the same reason the selection
		// does: it lives on the page's `EditorState`.)
		await dragOnCanvas(page, [200, 150], [300, 225]);
		const drawn = elementAt(page, "children[2]");
		await expect(drawn).toBeAttached({ timeout: 10000 });
		await expectAttrNear(drawn, "x", 200);
		await expectAttrNear(drawn, "y", 150);
		await expectAttrNear(drawn, "width", 100);
		await expectAttrNear(drawn, "height", 75);
		await expect(layerRows(page)).toHaveCount(3);
	});
});

// =============================================================================
// Choosing an image
// =============================================================================

test.describe("The image picker", () => {
	test("takes the Inspector's place while the Image tool is up", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, IMAGE_PROJECT);
		await openVisualEditor(page);

		// The Inspector holds the panel until the Image tool is picked up.
		await expect(inspectorPanel(page)).toBeVisible();
		await expect(imagePicker(page)).toHaveCount(0);

		await toolButton(page, "Image").click();

		await expect(imagePicker(page)).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Place an image" }),
		).toBeVisible();
		// Not merely covered up: the two panels are mutually exclusive, which
		// is the reason notices had to move out of the Inspector.
		await expect(inspectorPanel(page)).toHaveCount(0);

		await toolButton(page, "Select").click();

		await expect(inspectorPanel(page)).toBeVisible();
		await expect(imagePicker(page)).toHaveCount(0);
	});

	test("answers to the I key, and hands the panel back on V", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, IMAGE_PROJECT);
		await openVisualEditor(page);
		await expect(inspectorPanel(page)).toBeVisible();

		await page.keyboard.press("i");
		await expect(imagePicker(page)).toBeVisible();

		await page.keyboard.press("v");
		await expect(inspectorPanel(page)).toBeVisible();
		await expect(imagePicker(page)).toHaveCount(0);
	});

	test("lists every image, by basename and intrinsic size, sorted by path", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, IMAGE_PROJECT);
		await openVisualEditor(page);
		await toolButton(page, "Image").click();

		// Two, so the manifest and every other non-image file in the project
		// are absent rather than merely further down the list.
		await expect(imageChoices(page)).toHaveCount(2);

		// Sorted by path, so `photos/tall.png` comes first — which is the
		// opposite of the order the basenames alone would give, and the
		// opposite of the order they were uploaded in.
		await expect(imageChoices(page).nth(0)).toContainText("tall.png");
		await expect(imageChoices(page).nth(1)).toContainText("wide.png");

		// The basename is what is shown; the path is what identifies the row.
		await expect(imageChoice(page, "photos/tall.png")).toContainText(
			"tall.png",
			{ timeout: 10000 },
		);
		await expect(imageChoice(page, "photos/tall.png")).not.toContainText(
			"photos/",
		);

		// Intrinsic size, which is the browser's own reading of the file
		// rather than anything the test told it.
		await expect(imageChoice(page, "photos/tall.png")).toContainText(
			"20×60",
			{ timeout: 10000 },
		);
		await expect(imageChoice(page, "wide.png")).toContainText("40×20", {
			timeout: 10000,
		});
	});

	test("chooses for you when the project holds exactly one image", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, ONE_IMAGE_PROJECT);
		await openVisualEditor(page);
		await toolButton(page, "Image").click();

		await expect(imageChoices(page)).toHaveCount(1);
		// Nothing was clicked. With one image there is nothing to ask.
		await expect(imageChoice(page, "photos/tall.png")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	});

	test("marks one image at a time, and moves the mark when another is picked", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, IMAGE_PROJECT);
		await openVisualEditor(page);
		await toolButton(page, "Image").click();
		await expect(imageChoices(page)).toHaveCount(2);

		// Two images, so the auto-choice above does not apply and the picker
		// starts with the question genuinely open.
		for (const path of ["photos/tall.png", "wide.png"]) {
			await expect(imageChoice(page, path)).toHaveAttribute(
				"aria-pressed",
				"false",
			);
		}

		await imageChoice(page, "wide.png").click();
		await expect(imageChoice(page, "wide.png")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(imageChoice(page, "photos/tall.png")).toHaveAttribute(
			"aria-pressed",
			"false",
		);

		await imageChoice(page, "photos/tall.png").click();
		await expect(imageChoice(page, "photos/tall.png")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(imageChoice(page, "wide.png")).toHaveAttribute(
			"aria-pressed",
			"false",
		);
	});

	test("says so, and offers nothing, when the project has no images", async ({
		page,
		browserName,
	}) => {
		await uploadProject(browserName, page, STATIC_PROJECT);
		await openVisualEditor(page);
		await toolButton(page, "Image").click();

		await expect(imagePicker(page).locator(".empty")).toHaveText(
			"This project has no images yet. Add one to the file list on the " +
				"left, then come back.",
		);
		await expect(imageChoices(page)).toHaveCount(0);
	});
});

// =============================================================================
// Placing an image
// =============================================================================

test.describe("Placing an image", () => {
	test.beforeEach(async ({ page, browserName }) => {
		await uploadProject(browserName, page, IMAGE_PROJECT);
		await openVisualEditor(page);
	});

	test("a drag writes an image element the drawing and the manifest agree on", async ({
		page,
	}) => {
		await chooseImage(page, "wide.png", "40×20");
		await drawTheBox(page);

		const placed = elementAt(page, "children[2]");
		await expect(placed).toBeAttached({ timeout: 10000 });
		// An `<image>`, not a `<rect>` with a picture in it.
		expect(await placed.evaluate(node => node.tagName)).toBe("image");

		// It joins the layers tree under its own name, and becomes the
		// selection, exactly as a drawn shape does.
		await expect(layerRows(page)).toHaveCount(3);
		await expect(layerRows(page).nth(2)).toContainText("image wide.png");
		await expect(layerRows(page).nth(2)).toHaveAttribute(
			"aria-selected",
			"true",
		);

		const source = await manifestSource(page, "collagen.json");
		expect(source).toContain(`"image_path": "wide.png"`);
		// The primary key decides the kind of tag, so an image must not also
		// carry a `tag` — validation dispatches on exactly one of them.
		expect(source.match(/"tag":\s*"rect"/g)).toHaveLength(1);
		expect(source).toContain(`"x": ${await placed.getAttribute("x")}`);
		expect(source).toContain(
			`"width": ${await placed.getAttribute("width")}`,
		);
	});

	test("writes the whole project-relative path, not the basename it shows", async ({
		page,
	}) => {
		await chooseImage(page, "photos/tall.png", "20×60");
		await drawTheBox(page);
		await expect(elementAt(page, "children[2]")).toBeAttached({
			timeout: 10000,
		});

		const source = await manifestSource(page, "collagen.json");
		expect(source).toContain(`"image_path": "photos/tall.png"`);
		// The row is labelled `tall.png`; writing that is what would happen if
		// the basename the picker displays were mistaken for the identity, and
		// the image would then fail to resolve.
		expect(source).not.toContain(`"image_path": "tall.png"`);
	});

	test("letterboxes a wide image inside the box that was drawn", async ({
		page,
	}) => {
		await chooseImage(page, "wide.png", "40×20");
		await drawTheBox(page);

		const placed = elementAt(page, "children[2]");
		await expect(placed).toBeAttached({ timeout: 10000 });

		// 2:1 into a 4:3 box 200 by 150: the width fills and the height does
		// not, leaving 25 units of letterbox above and below. Stretching to the
		// box would give 200 by 150, which is what this rules out.
		await expectFittedImage(placed, {
			x: DRAW_BOX.from[0],
			y: DRAW_BOX_CENTRE.y - 50,
			width: 200,
			height: 100,
		});
	});

	test("pillarboxes a tall image inside the very same box", async ({
		page,
	}) => {
		await chooseImage(page, "photos/tall.png", "20×60");
		await drawTheBox(page);

		const placed = elementAt(page, "children[2]");
		await expect(placed).toBeAttached({ timeout: 10000 });

		// 1:3 into the same box: now the height fills instead, which is the
		// other branch of the fit. The pair is the point — a fit that only ever
		// matched one axis would pass whichever test happened to agree with it.
		await expectFittedImage(placed, {
			x: DRAW_BOX_CENTRE.x - 25,
			y: DRAW_BOX.from[1],
			width: 50,
			height: 150,
		});
	});

	test("refuses a drag with no image chosen, and says why", async ({
		page,
	}) => {
		const before = await manifestSource(page, "collagen.json");

		await toolButton(page, "Image").click();
		await expect(imageChoices(page)).toHaveCount(2);
		// Two images, so nothing has been chosen for the user.
		await expect(imageChoice(page, "wide.png")).toHaveAttribute(
			"aria-pressed",
			"false",
		);

		await drawTheBox(page);

		// The notice lives in the panel column rather than in the Inspector,
		// which is not on screen at all right now — this is the refusal that
		// used to be written somewhere invisible.
		await expect(
			page.getByText("Choose an image on the right first."),
		).toBeVisible();
		await expect(imagePicker(page)).toBeVisible();

		// Nothing placed, and the manifest byte for byte as it was.
		await expect(layerRows(page)).toHaveCount(2);
		await expect(elementAt(page, "children[2]")).toHaveCount(0);
		expect(await manifestSource(page, "collagen.json")).toBe(before);

		// The positive control, without picking the tool up again: choosing an
		// image and drawing the same box now does place one. So the refusal was
		// the missing choice and not a drag the canvas never saw.
		await imageChoice(page, "wide.png").click();
		await expect(imageChoice(page, "wide.png")).toContainText("40×20", {
			timeout: 10000,
		});
		await drawTheBox(page);
		await expect(elementAt(page, "children[2]")).toBeAttached({
			timeout: 10000,
		});
		await expect(layerRows(page)).toHaveCount(3);
	});

	test("reverts to Select once the image is placed", async ({ page }) => {
		await chooseImage(page, "wide.png", "40×20");
		await drawTheBox(page);
		await expect(elementAt(page, "children[2]")).toBeAttached({
			timeout: 10000,
		});

		// The panel comes back, which is the visible half of the claim.
		await expect(inspectorPanel(page)).toBeVisible();
		await expect(imagePicker(page)).toHaveCount(0);

		// And the behavioural half: the next press selects what is under it
		// rather than placing a second copy of the image.
		await clickOnCanvas(page, 105, 75);
		await expect(layerRows(page)).toHaveCount(3);
		await expect(layerRows(page).nth(0)).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(attributeInput(page, "width")).toHaveValue("110");
	});

	test("leaves a placed image selectable, with its geometry on show", async ({
		page,
	}) => {
		await chooseImage(page, "wide.png", "40×20");
		await drawTheBox(page);

		const placed = elementAt(page, "children[2]");
		await expect(placed).toBeAttached({ timeout: 10000 });

		// Away and back again, so this is a selection the pointer made rather
		// than the one placing it left behind.
		await clickOnCanvas(page, 380, 20);
		await expect(layerRows(page).nth(2)).toHaveAttribute(
			"aria-selected",
			"false",
		);

		await clickOnCanvas(page, DRAW_BOX_CENTRE.x, DRAW_BOX_CENTRE.y);

		await expect(layerRows(page).nth(2)).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(inspectorPanel(page)).toContainText("image wide.png");
		// Against the drawing rather than against numbers of its own: what
		// this is pinning is that the Inspector shows the placed image's
		// geometry, which is a claim about the panel and not about the fit.
		for (const key of ["x", "y", "width", "height"]) {
			await expect(attributeInput(page, key)).toHaveValue(
				(await placed.getAttribute(key))!,
			);
		}
	});

	test("draws all four resize handles on a placed image", async ({ page }) => {
		await chooseImage(page, "wide.png", "40×20");
		await drawTheBox(page);
		await expect(elementAt(page, "children[2]")).toBeAttached({
			timeout: 10000,
		});
		await expect(selectionOutline(page)).toBeVisible();

		// `<image>` has a width and a height to set, so `resizeEdits` handles
		// it and the handles are offered. Whether dragging one does anything
		// is the next test, which is a different question — and, right now, a
		// different answer.
		for (const handle of RESIZE_HANDLES) {
			await expect(page.getByLabel(handle)).toHaveCount(1);
		}
	});

	/*
	 * These two guard a bug that shipped and was fixed: `tagNameAt` read
	 * `node.tag` and nothing else, so an element whose primary key is
	 * `image_path` came back nameless. Moving refused with a misleading notice
	 * and resizing did nothing at all -- while `canResize` went on drawing four
	 * handles, because it dispatches on the *rendered* element's tag, which is
	 * `image` and which `resizeEdits` accepts. Inert handles are the one thing
	 * the comment above `canResize` exists to forbid.
	 */

	test("a placed image can be moved like any other element", async ({
		page,
	}) => {
		await chooseImage(page, "wide.png", "40×20");
		await drawTheBox(page);

		const placed = elementAt(page, "children[2]");
		await expect(placed).toBeAttached({ timeout: 10000 });
		await expectAttrNear(placed, "x", 20);
		await expectAttrNear(placed, "y", 155);

		// From the placed image's middle, 60 right and 20 down.
		await dragOnCanvas(
			page,
			[DRAW_BOX_CENTRE.x, DRAW_BOX_CENTRE.y],
			[DRAW_BOX_CENTRE.x + 60, DRAW_BOX_CENTRE.y + 20],
		);

		await expectAttrNear(placed, "x", 80);
		await expectAttrNear(placed, "y", 175);
		// `<image>` positions itself with `x` and `y`, so those are what a move
		// should rewrite — not a transform wrapped around them.
		await expect(placed).not.toHaveAttribute("transform", /.*/);

		const source = await manifestSource(page, "collagen.json");
		expect(source).toContain(`"x": ${await placed.getAttribute("x")}`);
		expect(source).toContain(`"y": ${await placed.getAttribute("y")}`);
	});

	test("a placed image can be resized by the handles it is given", async ({
		page,
	}) => {
		await chooseImage(page, "wide.png", "40×20");
		await drawTheBox(page);

		const placed = elementAt(page, "children[2]");
		await expect(placed).toBeAttached({ timeout: 10000 });
		await expectAttrNear(placed, "width", 200);

		// The south-east corner sits at (220, 255); drag it 40 units right and
		// 30 down, which anchors the north-west corner and grows the box.
		const perUnit = await pixelsPerUnit(page);
		await beginResizeTravel(page, "Resize se", 40 * perUnit, 30 * perUnit);
		await page.mouse.up();

		await expectAttrNear(placed, "width", 240);
		await expectAttrNear(placed, "height", 130);
		// Anchored, not moved.
		await expectAttrNear(placed, "x", 20);
		await expectAttrNear(placed, "y", 155);

		const source = await manifestSource(page, "collagen.json");
		expect(source).toContain(
			`"width": ${await placed.getAttribute("width")}`,
		);
	});

	test("embeds the file itself in the generated SVG", async ({ page }) => {
		await chooseImage(page, "wide.png", "40×20");
		await drawTheBox(page);
		await expect(elementAt(page, "children[2]")).toBeAttached({
			timeout: 10000,
		});

		// The rendered pane, not the canvas: this is the file a user would
		// download, and embedding every asset is the whole point of Collagen.
		await renderedModeButton(page).click();
		await expect(mainViewerPane(page)).toBeVisible();

		const embedded = svgDoc(mainViewerPane(page)).locator("image");
		await expect(embedded).toHaveCount(1);
		// Byte for byte the PNG that was uploaded, so this says *which* image
		// was embedded and not merely that some data URI was written.
		await expect(embedded).toHaveAttribute(
			"href",
			`data:image/png;base64,${WIDE_PNG.base64}`,
			{ timeout: 10000 },
		);
	});
});

// =============================================================================
// Inspector
// =============================================================================

test.describe("Properties panel", () => {
	test.beforeEach(async ({ page, browserName }) => {
		await uploadProject(browserName, page, STATIC_PROJECT);
		await openVisualEditor(page);
		await clickOnCanvas(page, 105, 75);
		await expect(attributeInput(page, "width")).toHaveValue("110");
	});

	test("editing a value updates the drawing and the manifest", async ({
		page,
	}) => {
		await attributeInput(page, "width").fill("200");
		await attributeInput(page, "width").press("Enter");

		const rect = elementAt(page, "children[0]");
		await expect(rect).toHaveAttribute("width", "200", { timeout: 10000 });
		// Typed numbers stay numbers, so they keep working with arithmetic.
		const source = await manifestSource(page, "collagen.json");
		expect(source).toContain(`"width": 200`);
	});

	test("editing a coordinate moves the shape", async ({ page }) => {
		await attributeInput(page, "x").fill("250");
		await attributeInput(page, "x").press("Enter");

		const rect = elementAt(page, "children[0]");
		await expect(rect).toHaveAttribute("x", "250", { timeout: 10000 });
		await expect(rect).toHaveAttribute("y", "40");
	});

	test("removing an attribute drops it from the drawing", async ({ page }) => {
		await page.getByLabel("Remove height", { exact: true }).click();

		const rect = elementAt(page, "children[0]");
		await expect(rect).not.toHaveAttribute("height", /.*/, {
			timeout: 10000,
		});
		await expect(attributeInput(page, "height")).toHaveCount(0);

		const source = await manifestSource(page, "collagen.json");
		expect(source).not.toContain(`"height"`);
	});
});

// =============================================================================
// Expressions behind computed attributes
// =============================================================================

/*
 * The panel shows how an attribute is *written*, not only what it comes to.
 * Selecting the second of four circles a loop produced used to show `cx` as
 * 160, which is true and useless: the thing worth editing is `70 + i * 90`,
 * the loop body itself, and it was invisible from the canvas.
 *
 * A literal keeps its typed widget -- a swatch beats the text `'#f59e0b'` --
 * and gains a toggle to be edited as code instead. The toggle is explicit
 * because inference is a trap here: `120 + i * 18` is obviously an expression,
 * but a `fill` of `red` is a colour and not a variable named red.
 */

test.describe("Expressions in the properties panel", () => {
	test.beforeEach(async ({ page, browserName }) => {
		await uploadProject(browserName, page, EXPRESSION_PROJECT);
		await openVisualEditor(page);
		await expect(canvasDoc(page).locator("circle")).toHaveCount(4);
	});

	/** The four instances, in the order the comprehension emits them. */
	function circles(page: Page): Locator {
		return canvasDoc(page).locator("circle");
	}

	test("shows a computed attribute as it is written, and what it comes to", async ({
		page,
	}) => {
		await clickOnCanvas(page, FANNED_CX[1], FANNED_CY);

		// The drawing says 160. The panel says what the manifest says, which is
		// the loop body, with the 160 alongside as a reading.
		await expect(elementAt(page, "children[1]")).toHaveAttribute("cx", "160");
		await expect(attributeInput(page, "cx")).toHaveValue("70 + i * 90");
		await expect(evaluatedBadge(page)).toHaveText("= 160");

		// One badge, not four: the literals are shown as the values they are,
		// and a value has nothing to evaluate to.
		await expect(evaluatedBadge(page)).toHaveCount(1);
		await expect(attributeInput(page, "cy")).toHaveValue("150");
		await expect(attributeInput(page, "r")).toHaveValue("26");
	});

	test("keeps the expression as the selection moves, and moves the reading", async ({
		page,
	}) => {
		await clickOnCanvas(page, FANNED_CX[0], FANNED_CY);
		await expect(attributeInput(page, "cx")).toHaveValue("70 + i * 90");
		await expect(evaluatedBadge(page)).toHaveText("= 70");

		await clickOnCanvas(page, FANNED_CX[3], FANNED_CY);

		// Every instance shares one source object, so the text on offer is the
		// same text however many of them there are. Only the reading differs.
		await expect(attributeInput(page, "cx")).toHaveValue("70 + i * 90");
		await expect(evaluatedBadge(page)).toHaveText("= 340");
	});

	test("editing the expression rewrites the loop body, so all four move", async ({
		page,
	}) => {
		await clickOnCanvas(page, FANNED_CX[1], FANNED_CY);
		await expect(attributeInput(page, "cx")).toHaveValue("70 + i * 90");

		await attributeInput(page, "cx").fill("40 + i * 60");
		await attributeInput(page, "cx").press("Enter");

		// 40, 100, 160, 220: one instance was selected, and the edit landed on
		// the body all four are built from.
		for (let i = 0; i < 4; i++) {
			await expect(circles(page).nth(i)).toHaveAttribute(
				"cx",
				String(40 + i * 60),
				{ timeout: 10000 },
			);
		}

		const source = await manifestSource(page, "collagen.jsonnet");
		expect(source).toContain("cx: 40 + i * 60");
		// Verbatim, not quoted. `cx: "40 + i * 60"` is a string, which SVG
		// drops on the floor, and it would have made the loop pointless.
		expect(source).not.toContain(`cx: "40 + i * 60"`);
		expect(source).toContain("for i in std.range(0, 3)");
	});

	test("shows a literal as a value, and offers to make it code", async ({
		page,
	}) => {
		await clickOnCanvas(page, FANNED_CX[0], FANNED_CY);

		// `cy` is a plain 150, so it stays a value field with no reading
		// beside it — the only badge on screen is the one `cx` earns.
		await expect(attributeInput(page, "cy")).toHaveValue("150");
		await expect(evaluatedBadge(page)).toHaveCount(1);
		await expect(asCodeToggle(page, "cy")).toHaveAttribute(
			"aria-pressed",
			"false",
		);

		// `fill` is the clearest evidence that the toggle really swaps the
		// widget: the swatch shows the colour, and the source text is that
		// same colour with the quotes it is written with.
		await expect(attributeInput(page, "fill")).toHaveValue("#f59e0b");
		await asCodeToggle(page, "fill").click();
		await expect(asCodeToggle(page, "fill")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(attributeInput(page, "fill")).toHaveValue('"#f59e0b"');
	});

	test("a constant switched to code can then vary with the loop", async ({
		page,
	}) => {
		await clickOnCanvas(page, FANNED_CX[0], FANNED_CY);
		await expect(attributeInput(page, "cy")).toHaveValue("150");
		// All four sit on the same line to begin with.
		for (let i = 0; i < 4; i++) {
			await expect(circles(page).nth(i)).toHaveAttribute("cy", "150");
		}

		await asCodeToggle(page, "cy").click();
		// Seeded with the literal's own source text, so the field opens on
		// what is already there rather than on nothing.
		await expect(attributeInput(page, "cy")).toHaveValue("150");

		await attributeInput(page, "cy").fill("120 + i * 18");
		await attributeInput(page, "cy").press("Enter");

		// 120, 138, 156, 174: the constant has become something that varies,
		// which is the whole reason the toggle exists.
		for (let i = 0; i < 4; i++) {
			await expect(circles(page).nth(i)).toHaveAttribute(
				"cy",
				String(120 + i * 18),
				{ timeout: 10000 },
			);
		}

		const source = await manifestSource(page, "collagen.jsonnet");
		expect(source).toContain("cy: 120 + i * 18");
		// The bug the toggle exists to prevent: typing an expression into a
		// plain value field wrote `cy: "120 + i * 18"`, a string.
		expect(source).not.toContain(`cy: "120 + i * 18"`);
	});

	test("offers no such toggle on an attribute that is already code", async ({
		page,
	}) => {
		await clickOnCanvas(page, FANNED_CX[0], FANNED_CY);
		await expect(attributeInput(page, "cx")).toHaveValue("70 + i * 90");

		await expect(asCodeToggle(page, "cx")).toHaveCount(0);
		// The literals on the same element do have one, so this is a toggle
		// withheld from `cx` rather than a feature that is off.
		await expect(asCodeToggle(page, "r")).toHaveCount(1);
		await expect(asCodeToggle(page, "cy")).toHaveCount(1);
	});

	test("refuses Jsonnet that does not parse, and writes nothing", async ({
		page,
	}) => {
		const before = await manifestSource(page, "collagen.jsonnet");
		await clickOnCanvas(page, FANNED_CX[0], FANNED_CY);
		await expect(attributeInput(page, "cx")).toHaveValue("70 + i * 90");

		await attributeInput(page, "cx").fill("70 +");
		await attributeInput(page, "cx").press("Enter");

		await expect(page.getByText(/is not valid Jsonnet/)).toBeVisible();

		// The drawing is still a drawing. Accepting this would have left the
		// manifest unparseable, which takes the whole canvas down with it.
		await expect(circles(page)).toHaveCount(4);
		for (let i = 0; i < 4; i++) {
			await expect(circles(page).nth(i)).toHaveAttribute(
				"cx",
				String(FANNED_CX[i]),
			);
		}
		expect(await manifestSource(page, "collagen.jsonnet")).toBe(before);
	});
});

// =============================================================================
// Manifests the editor cannot analyze
// =============================================================================

test.describe("A manifest the editor cannot analyze", () => {
	test.beforeEach(async ({ page, browserName }) => {
		await uploadProject(browserName, page, OPAQUE_PROJECT);
		await openVisualEditor(page);
	});

	test("still renders, and explains why it is read-only", async ({ page }) => {
		// The drawing is generated the same way regardless: only write-back is
		// off. Both children are present and stamped.
		await expect(elementAt(page, "children[0]")).toBeAttached();
		await expect(elementAt(page, "children[1]")).toBeAttached();

		await expect(
			page.getByText(
				/Visual editing is off for this manifest.*enumerated or compared/,
			),
		).toBeVisible();
	});

	test("still allows selecting, and shows the attributes read-only", async ({
		page,
	}) => {
		await clickOnCanvas(page, 100, 80);

		await expect(layerRows(page).nth(0)).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(attributeInput(page, "x")).toHaveValue("40");
		await expect(attributeInput(page, "width")).toHaveValue("120");
	});

	test("refuses a drag, and leaves the manifest untouched", async ({
		page,
	}) => {
		const before = await manifestSource(page, "collagen.jsonnet");

		await dragOnCanvas(page, [100, 80], [160, 130]);

		await expect(
			page.getByText("This element cannot be edited here. Edit it as text."),
		).toBeVisible({ timeout: 10000 });

		// Nothing moved, and nothing was written.
		const rect = elementAt(page, "children[0]");
		await expect(rect).toHaveAttribute("x", "40");
		await expect(rect).toHaveAttribute("y", "40");
		expect(await manifestSource(page, "collagen.jsonnet")).toBe(before);
	});

	test("refuses an attribute edit too", async ({ page }) => {
		await clickOnCanvas(page, 100, 80);
		await attributeInput(page, "width").fill("240");
		await attributeInput(page, "width").press("Enter");

		await expect(
			page.getByText("This element cannot be edited here. Edit it as text."),
		).toBeVisible({ timeout: 10000 });
		await expect(elementAt(page, "children[0]")).toHaveAttribute(
			"width",
			"120",
		);
	});
});

// =============================================================================
// When a press is not a drag
// =============================================================================

test.describe("Telling a click from a drag", () => {
	test.beforeEach(async ({ page, browserName }) => {
		await uploadProject(browserName, page, POINTER_PROJECT);
		await openVisualEditor(page);
	});

	test("a press with a pixel or two of jitter selects and writes nothing", async ({
		page,
	}) => {
		const before = await manifestSource(page, "collagen.jsonnet");
		const rect = elementAt(page, "children[0]");

		// Two hand tremors: one pixel, then a diagonal 2.83 that is still shy
		// of the three-pixel threshold.
		for (const [dx, dy] of [
			[1, 0],
			[2, 2],
		] as const) {
			await pressAndTravel(page, RECT_CENTRE, dx, dy);
			await page.mouse.up();

			// It selected, which is the whole of what a click should do.
			await expect(layerRows(page).nth(ROW.rect)).toHaveAttribute(
				"aria-selected",
				"true",
			);
			await expect(rect).toHaveAttribute("x", "40");
			await expect(rect).toHaveAttribute("y", "30");
		}

		// Byte for byte: no edit, and so no undo entry either.
		expect(await manifestSource(page, "collagen.jsonnet")).toBe(before);
	});

	test("a press that travels past the threshold still moves the shape", async ({
		page,
	}) => {
		const before = await manifestSource(page, "collagen.jsonnet");
		const perUnit = await pixelsPerUnit(page);
		const rect = elementAt(page, "children[0]");

		await pressAndTravel(page, RECT_CENTRE, 40, 0);
		await page.mouse.up();

		// The whole travel is committed, not the travel past the threshold.
		await expectAttrNear(rect, "x", 40 + 40 / perUnit);
		await expect(rect).toHaveAttribute("y", "30");

		const source = await manifestSource(page, "collagen.jsonnet");
		expect(source, "the manifest should have been rewritten").not.toBe(
			before,
		);
		expect(source).not.toContain("x: 40,");
		expect(source).toContain("y: 30,");
	});

	test("pointercancel abandons the drag in flight", async ({ page }) => {
		const before = await manifestSource(page, "collagen.jsonnet");
		const rect = elementAt(page, "children[0]");

		const at = await pressAndTravel(page, RECT_CENTRE, 40, 0);
		// The preview is a CSS transform on the rendered element, so the style
		// attribute is the visible proof that a drag is under way.
		await expect(rect).toHaveAttribute("style", /translate/);

		// `page.mouse` cannot produce this one. `pointercancel` is the browser
		// taking a gesture away — a system swipe, a lost pointer capture — not
		// something an input device sends, so Playwright has no API for it.
		// Every other gesture in this file is real input; this single event is
		// synthesized, on `window`, which is where `CanvasViewport` listens.
		await page.evaluate(() => {
			window.dispatchEvent(
				new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 }),
			);
		});

		await expect(rect).not.toHaveAttribute("style", /translate/);

		// The button is still down, and the pointer must no longer drag.
		await page.mouse.move(at.x + 40, at.y + 20);
		await expect(rect).not.toHaveAttribute("style", /translate/);
		await page.mouse.up();

		await expect(rect).toHaveAttribute("x", "40");
		await expect(rect).toHaveAttribute("y", "30");
		expect(await manifestSource(page, "collagen.jsonnet")).toBe(before);
	});

	test("Escape abandons the drag but keeps the selection", async ({
		page,
	}) => {
		const before = await manifestSource(page, "collagen.jsonnet");
		const rect = elementAt(page, "children[0]");

		const at = await pressAndTravel(page, RECT_CENTRE, 40, 0);
		await expect(rect).toHaveAttribute("style", /translate/);

		await page.keyboard.press("Escape");
		await expect(rect).not.toHaveAttribute("style", /translate/);
		// Calling the drag off must not also throw the selection away.
		await expect(layerRows(page).nth(ROW.rect)).toHaveAttribute(
			"aria-selected",
			"true",
		);

		// Carrying on and releasing commits nothing either.
		await page.mouse.move(at.x + 40, at.y + 20);
		await page.mouse.up();
		await expect(rect).toHaveAttribute("x", "40");
		await expect(rect).toHaveAttribute("y", "30");

		// A second Escape has no drag left to call off, so it does the other
		// thing Escape means here.
		await page.keyboard.press("Escape");
		await expect(layerRows(page).nth(ROW.rect)).toHaveAttribute(
			"aria-selected",
			"false",
		);
		await expect(
			page.getByText("Select something on the canvas."),
		).toBeVisible();

		expect(await manifestSource(page, "collagen.jsonnet")).toBe(before);
	});
});

// =============================================================================
// Resize handles
// =============================================================================

test.describe("Resize handles", () => {
	test.beforeEach(async ({ page, browserName }) => {
		await uploadProject(browserName, page, POINTER_PROJECT);
		await openVisualEditor(page);
	});

	// Selecting from the layers panel rather than the canvas: hit-testing a
	// `<text>` means landing on a glyph rather than on its box, which has
	// nothing to do with what is being pinned here.

	test("are absent on an element the editor cannot resize", async ({
		page,
	}) => {
		await layerRows(page).nth(ROW.text).click();

		// The `<text>` really is selected, so zero handles means zero handles
		// and not "nothing to draw them around".
		await expect(layerRows(page).nth(ROW.text)).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(attributeInput(page, "font-size")).toHaveValue("26");
		await expect(selectionOutline(page)).toBeVisible();

		for (const handle of RESIZE_HANDLES) {
			await expect(page.getByLabel(handle)).toHaveCount(0);
		}
	});

	test("are drawn, all four, on one it can", async ({ page }) => {
		await layerRows(page).nth(ROW.rect).click();

		await expect(attributeInput(page, "width")).toHaveValue("120");
		await expect(selectionOutline(page)).toBeVisible();

		for (const handle of RESIZE_HANDLES) {
			await expect(page.getByLabel(handle)).toHaveCount(1);
		}
	});
});

// =============================================================================
// Cursor affordances
// =============================================================================

test.describe("What the cursor promises", () => {
	test.beforeEach(async ({ page, browserName }) => {
		await uploadProject(browserName, page, POINTER_PROJECT);
		await openVisualEditor(page);
	});

	test("the pan tool reads as grabbable, then as grabbed", async ({
		page,
	}) => {
		await toolButton(page, "Pan").click();
		await expectCursor(page, "grab");

		const point = await toClient(page, 200, 150);
		await page.mouse.move(point.x, point.y);
		await page.mouse.down();
		await expectCursor(page, "grabbing");

		await page.mouse.up();
		await expectCursor(page, "grab");
	});

	test("the select tool reads as movable over a shape, plain over blank canvas", async ({
		page,
	}) => {
		const overShape = await toClient(page, RECT_CENTRE[0], RECT_CENTRE[1]);
		await page.mouse.move(overShape.x, overShape.y);
		await expectCursor(page, "move");

		// Nothing is drawn in the top-right corner of this artboard.
		const overBlank = await toClient(page, 380, 20);
		await page.mouse.move(overBlank.x, overBlank.y);
		await expectCursor(page, "default");
	});

	test("a drag under way reads as grabbed", async ({ page }) => {
		await pressAndTravel(page, RECT_CENTRE, 40, 0);
		await expectCursor(page, "grabbing");
		await page.mouse.up();
	});

	test("a press that has not travelled yet does not", async ({ page }) => {
		const overShape = await toClient(page, RECT_CENTRE[0], RECT_CENTRE[1]);
		await page.mouse.move(overShape.x, overShape.y);
		await expectCursor(page, "move");

		// One pixel: pressed, but not yet a drag.
		const at = await pressAndTravel(page, RECT_CENTRE, 1, 0);

		// The press has landed *and* been painted — it selected the rect, which
		// the same render pass shows — so the cursor read below is of a settled
		// frame rather than of one the page has not got to yet. Without this
		// the assertion could pass by being early.
		await expect(layerRows(page).nth(ROW.rect)).toHaveAttribute(
			"aria-selected",
			"true",
		);
		// Deliberately an inequality. What it reads today is `default`, because
		// `over-shape` is switched off for the duration of any gesture — so a
		// press on a shape currently drops the move cursor on the way to
		// earning `grabbing`. Pinning `default` would pin that flicker; the fix
		// under test is only that `grabbing` has to be earned.
		expect(
			await canvasCursor(page),
			"a press that has not travelled has not earned the grabbing cursor",
		).not.toBe("grabbing");

		// Past the threshold it is a drag, and now says so.
		await page.mouse.move(at.x + 40, at.y);
		await expectCursor(page, "grabbing");

		await page.mouse.up();
		// Released over the shape it just moved, so it is back to an offer.
		await expectCursor(page, "move");
	});
});

// =============================================================================
// Reordering layers
// =============================================================================

test.describe("Dragging a layer row", () => {
	test.beforeEach(async ({ page, browserName }) => {
		await uploadProject(browserName, page, POINTER_PROJECT);
		await openVisualEditor(page);
		await expectLayerOrder(page, POINTER_LAYERS);
	});

	test("abandoned with no drop, does not reorder the next row released on", async ({
		page,
	}) => {
		const before = await manifestSource(page, "collagen.jsonnet");

		// Escape during an HTML5 drag fires `dragend` and no `drop` at all.
		await fireLayerDrag(page, [
			["dragstart", ROW.rect],
			["dragend", ROW.rect],
		]);
		// Releasing on another row afterwards is a new press, not the tail of
		// the abandoned drag. The same two events do reorder when a drag really
		// is in flight, which the selection test below relies on.
		await fireLayerDrag(page, [
			["dragover", ROW.circle],
			["drop", ROW.circle],
		]);

		// The write would be synchronous, so this is the assertion that cannot
		// pass by arriving before the damage.
		expect(await manifestSource(page, "collagen.jsonnet")).toBe(before);
		await expectLayerOrder(page, POINTER_LAYERS);
	});

	test("shows which row is moving and where it would land", async ({
		page,
	}) => {
		await fireLayerDrag(page, [["dragstart", ROW.rect]]);
		await expect(layerRows(page).nth(ROW.rect)).toHaveClass(/dragging/);

		await fireLayerDrag(page, [["dragover", ROW.circle]]);
		await expect(layerRows(page).nth(ROW.circle)).toHaveClass(/drop-target/);

		// The `<text>`'s own text child is not a sibling of the rect — its
		// `parentPath` is `children[1]` — so it can never be where the rect
		// lands, and must not offer itself as somewhere it could.
		await fireLayerDrag(page, [
			["dragleave", ROW.circle],
			["dragover", ROW.textChild],
		]);
		await expect(layersTree(page).locator(".drop-target")).toHaveCount(0);

		await fireLayerDrag(page, [["dragend", ROW.rect]]);
		await expect(layersTree(page).locator(".dragging")).toHaveCount(0);
		await expect(layersTree(page).locator(".drop-target")).toHaveCount(0);
	});

	test("carries the selection with it", async ({ page }) => {
		await layerRows(page).nth(ROW.rect).click();
		await expect(layerRows(page).nth(ROW.rect)).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(attributeInput(page, "width")).toHaveValue("120");

		// The rect from index 0 to index 2, past the `<text>` it sat above.
		await fireLayerDrag(page, [
			["dragstart", ROW.rect],
			["dragover", ROW.circle],
			["drop", ROW.circle],
			["dragend", ROW.rect],
		]);

		await expectLayerOrder(page, [
			"<text>",
			'"Collagen"',
			"<circle>",
			"<rect>",
		]);

		// Still the rect, not whatever now sits at the index it used to hold.
		await expect(layerRows(page).nth(3)).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(layerRows(page).nth(0)).toHaveAttribute(
			"aria-selected",
			"false",
		);
		await expect(attributeInput(page, "width")).toHaveValue("120");
		await expect(attributeInput(page, "font-size")).toHaveCount(0);
	});

	test("carries the hover highlight with it too", async ({ page }) => {
		// Hovering from the canvas, not from the panel. `hoveredPath` is
		// recomputed from whatever is under the pointer on every `pointermove`,
		// so the hover has to be set somewhere the reorder will not move the
		// pointer off — and the reorder itself is dispatched events, which move
		// no pointer. Resting on the rect is the one arrangement in which the
		// hover survives long enough to be looked at.
		const over = await toClient(page, RECT_CENTRE[0], RECT_CENTRE[1]);
		await page.mouse.move(over.x, over.y);

		// Nothing is selected, which matters: the hover outline is suppressed
		// on the selection, so a stray click here would erase the evidence.
		await expect(hoverOutline(page)).toBeVisible();
		await expectBoxesMatch(
			hoverOutline(page),
			elementAt(page, "children[0]"),
		);

		// The circle, from the bottom of the tree to the top. That pushes the
		// hovered rect from `children[0]` down to `children[1]`.
		await fireLayerDrag(page, [
			["dragstart", ROW.circle],
			["dragover", ROW.rect],
			["drop", ROW.rect],
			["dragend", ROW.circle],
		]);
		await expectLayerOrder(page, [
			"<circle>",
			"<rect>",
			"<text>",
			'"Collagen"',
		]);

		// Still on the rect — and the two shapes are nowhere near each other,
		// so a highlight left behind on `children[0]` is now a highlight around
		// the circle, which this cannot mistake for a pass.
		await expect(hoverOutline(page)).toBeVisible();
		await expectBoxesMatch(
			hoverOutline(page),
			elementAt(page, "children[1]"),
		);
	});
});
