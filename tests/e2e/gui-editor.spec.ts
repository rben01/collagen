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

/** Press, drag, and release between two points in the SVG's user units. */
async function dragOnCanvas(
	page: Page,
	from: readonly [number, number],
	to: readonly [number, number],
): Promise<void> {
	const start = await toClient(page, from[0], from[1]);
	const end = await toClient(page, to[0], to[1]);
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(end.x, end.y, { steps: 8 });
	await page.mouse.up();
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
