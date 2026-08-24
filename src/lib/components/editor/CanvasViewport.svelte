<script lang="ts">
	import { calculateZoomToPoint, CONTENT_PADDING } from "../viewer/index.js";
	import { resizeEdits } from "../../collagen-ts/manifest/geometry.js";
	import type { EditorState, ResizeHandle } from "./editor-state.svelte.js";

	let {
		svg,
		editor,
		scale = $bindable(1),
		panX = $bindable(0),
		panY = $bindable(0),
		onMove,
		onResize,
		onDraw,
	}: {
		/** The generated SVG, stamped with `data-clgn-path`. */
		svg: string;
		editor: EditorState;
		scale?: number;
		panX?: number;
		panY?: number;
		/**
		 * Commit a move, in user units.
		 *
		 * Returns whether the drawing will be regenerated. False means the
		 * preview has to go now, because nothing is coming to replace it.
		 */
		onMove: (path: string, dx: number, dy: number) => boolean;
		/** Commit a resize to a new box, in user units. Returns as `onMove` does. */
		onResize: (
			path: string,
			x: number,
			y: number,
			width: number,
			height: number,
		) => boolean;
		/** Commit a newly drawn shape, in user units. */
		onDraw: (x: number, y: number, width: number, height: number) => void;
	} = $props();

	let container: HTMLDivElement | null = $state(null);
	let frame: HTMLIFrameElement | null = $state(null);
	let containerWidth = $state(0);
	let containerHeight = $state(0);
	/** Bumped when the frame loads, so measurements recompute against it. */
	let frameRevision = $state(0);

	const HANDLES: ResizeHandle[] = ["nw", "ne", "sw", "se"];

	/**
	 * How far the pointer must travel before a press counts as a drag.
	 *
	 * Without this, the hand tremor in an ordinary click writes a real edit to
	 * the manifest and an entry to the undo stack. Selecting something must not
	 * modify the document.
	 */
	const DRAG_THRESHOLD = 3;

	/** Has this gesture travelled far enough to act on? */
	function hasTravelled(dxScreen: number, dyScreen: number): boolean {
		return Math.hypot(dxScreen, dyScreen) >= DRAG_THRESHOLD;
	}

	/** The SVG's own coordinate system, read from its viewBox. */
	const viewBox = $derived.by(() => {
		const match = svg.match(/viewBox="([^"]*)"/);
		if (!match) return null;
		const parts = match[1].trim().split(/\s+/g).map(Number);
		if (parts.length !== 4 || parts.some(n => !Number.isFinite(n)))
			return null;
		return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
	});

	/**
	 * The frame's size, fitted to the drawing's proportions exactly.
	 *
	 * `calculateConstrainedDimensions` is not used here, though the rest of the
	 * viewer's maths is. It subtracts its padding from both axes after fitting,
	 * which leaves the result a fraction off the viewBox's aspect ratio -- for a
	 * 4:3 drawing in this pane, 589 by 440 rather than 589 by 441.75. The
	 * drawing then either overflows the frame and is clipped, or letterboxes
	 * inside it, and either way a pointer coordinate no longer converts cleanly.
	 * Taking the padding off first and fitting after keeps the two in step.
	 */
	const constrained = $derived.by(() => {
		if (!viewBox || viewBox.width === 0 || viewBox.height === 0) {
			return { width: containerWidth, height: containerHeight };
		}
		const availableWidth = Math.max(0, containerWidth - CONTENT_PADDING);
		const availableHeight = Math.max(0, containerHeight - CONTENT_PADDING);
		const scale = Math.min(
			availableWidth / viewBox.width,
			availableHeight / viewBox.height,
		);
		return { width: viewBox.width * scale, height: viewBox.height * scale };
	});

	/**
	 * The drawing, wrapped in a document that does not inset it.
	 *
	 * A bare SVG in `srcdoc` lands inside a body with the default 8px margin,
	 * which pushes the drawing off the frame's origin and shrinks it. Every
	 * pointer coordinate is then converted against a span the drawing does not
	 * actually occupy.
	 */
	const frameDocument = $derived(
		`<!doctype html><meta charset="utf-8">` +
			`<style>html,body{margin:0;padding:0;overflow:hidden}` +
			`svg{display:block;width:100%;height:100%}</style>${svg}`,
	);

	/**
	 * The drawing's box in the page's own coordinates, the viewer's zoom and pan
	 * included.
	 *
	 * Measured from the `<svg>` itself rather than the frame around it. The
	 * frame is sized by `calculateConstrainedDimensions`, which subtracts its
	 * padding from both axes and so does not hold the viewBox's aspect ratio
	 * exactly; the drawing letterboxes itself inside whatever it is given. Using
	 * the frame's width would make every gesture a little short.
	 */
	function drawingRect(): {
		left: number;
		top: number;
		width: number;
		height: number;
	} | null {
		const drawing = frame?.contentDocument?.querySelector("svg");
		if (!drawing || !frame) return null;

		const frameRect = frame.getBoundingClientRect();
		if (frameRect.width === 0 || constrained.width === 0) return null;

		const factor = frameRect.width / constrained.width;
		const inner = drawing.getBoundingClientRect();
		return {
			left: frameRect.left + inner.left * factor,
			top: frameRect.top + inner.top * factor,
			width: inner.width * factor,
			height: inner.height * factor,
		};
	}

	/** Screen pixels per SVG user unit, including the viewer's own zoom. */
	function screenPerUnit(): number {
		const drawing = drawingRect();
		if (!drawing || !viewBox || viewBox.width === 0) return 1;
		return drawing.width / viewBox.width;
	}

	/** A client point in the iframe's own CSS pixels, for `elementFromPoint`. */
	function toFrameSpace(
		clientX: number,
		clientY: number,
	): { x: number; y: number } | null {
		if (!frame) return null;
		const rect = frame.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return null;
		return {
			x: ((clientX - rect.left) / rect.width) * constrained.width,
			y: ((clientY - rect.top) / rect.height) * constrained.height,
		};
	}

	/** The manifest path of whatever sits under a client point. */
	function pathAt(clientX: number, clientY: number): string | null {
		const doc = frame?.contentDocument;
		const local = toFrameSpace(clientX, clientY);
		if (!doc || !local) return null;

		const hit = doc.elementFromPoint(local.x, local.y);
		if (!hit) return null;

		// Content pulled in by `svg_path` or `clgn_path` is foreign text that can
		// carry its own `data-clgn-*`. Resolving to the opaque ancestor means a
		// forged attribute inside one can never be selected as if it were real.
		let opaque: Element | null = null;
		for (let node: Element | null = hit; node; node = node.parentElement) {
			if (node.hasAttribute?.("data-clgn-opaque")) opaque = node;
		}
		const resolved = opaque ?? hit.closest?.("[data-clgn-path]");
		const path = resolved?.getAttribute("data-clgn-path") ?? null;

		// The root <svg> is stamped too, and a press on blank artboard resolves
		// to it. Treat that as a press on nothing: clicking empty space clears
		// the selection everywhere else, and selecting the document would
		// otherwise put resize handles around the whole drawing with no layer
		// row or properties to match them.
		return path === "" ? null : path;
	}

	/** The element a path names, inside the rendered document. */
	function elementFor(path: string): Element | null {
		const doc = frame?.contentDocument;
		if (!doc) return null;
		return doc.querySelector(`[data-clgn-path="${CSS.escape(path)}"]`);
	}

	/**
	 * An element's on-screen box, in the container's coordinates.
	 *
	 * Read through the iframe: `getBoundingClientRect` inside it is in the
	 * frame's own CSS pixels, which the viewer's transform then scales.
	 */
	function boxFor(
		path: string,
	): { left: number; top: number; width: number; height: number } | null {
		// Referenced so the box recomputes when any of these change. The gesture
		// is in there so the outline tracks the element during a drag: the
		// preview is a CSS transform, which `getBoundingClientRect` reflects.
		void scale;
		void panX;
		void panY;
		void frameRevision;
		void containerWidth;
		void containerHeight;
		void editor.gesture;

		const element = elementFor(path);
		if (!element || !frame || !container) return null;

		const frameRect = frame.getBoundingClientRect();
		if (frameRect.width === 0 || constrained.width === 0) return null;

		const factor = frameRect.width / constrained.width;
		const inner = element.getBoundingClientRect();
		const containerRect = container.getBoundingClientRect();

		return {
			left: frameRect.left + inner.left * factor - containerRect.left,
			top: frameRect.top + inner.top * factor - containerRect.top,
			width: inner.width * factor,
			height: inner.height * factor,
		};
	}

	const selectionBox = $derived(
		editor.selectedPath === null ? null : boxFor(editor.selectedPath),
	);

	/**
	 * Can the selection be resized?
	 *
	 * Handles on a `<text>` or a `<path>` promise something the editor cannot
	 * do: dragging one only ever produced a refusal. The tag comes off the
	 * rendered element, which is the same thing `resizeEdits` dispatches on.
	 */
	const canResize = $derived.by(() => {
		void frameRevision;
		if (editor.selectedPath === null) return false;
		const element = elementFor(editor.selectedPath);
		if (!element) return false;
		return resizeEdits(element.tagName, 0, 0, 1, 1) !== null;
	});
	const hoverBox = $derived(
		editor.hoveredPath === null || editor.hoveredPath === editor.selectedPath
			? null
			: boxFor(editor.hoveredPath),
	);

	/**
	 * Every element sharing a source construct with the selection.
	 *
	 * Highlighting them all is what makes "this edit changes four things"
	 * visible before the user commits to it, rather than after.
	 */
	let groupPaths = $state<string[]>([]);
	const groupBoxes = $derived(
		groupPaths
			.filter(path => path !== editor.selectedPath)
			.map(boxFor)
			.filter(box => box !== null),
	);

	export function setGroup(paths: string[]): void {
		groupPaths = paths;
	}

	function handleWheel(event: WheelEvent) {
		if (!event.ctrlKey && !event.metaKey) return;
		event.preventDefault();
		if (!container) return;

		const next = calculateZoomToPoint(
			event.clientX,
			event.clientY,
			event.deltaY > 0 ? 0.9 : 1.1,
			container.getBoundingClientRect(),
			{ scale, panX, panY },
		);
		scale = next.scale;
		panX = next.panX;
		panY = next.panY;
	}

	function handlePointerDown(event: PointerEvent) {
		if (event.button !== 0 && event.button !== 1) return;
		const wantsPan =
			editor.tool === "pan" || event.button === 1 || event.altKey;

		if (wantsPan) {
			editor.gesture = {
				kind: "pan",
				startX: event.clientX,
				startY: event.clientY,
				panX,
				panY,
			};
			return;
		}

		if (editor.tool !== "select") {
			const local = toUserSpace(event.clientX, event.clientY);
			if (!local) return;
			editor.gesture = {
				kind: "draw",
				startX: local.x,
				startY: local.y,
				x: local.x,
				y: local.y,
				moved: false,
				// Screen coordinates are kept only to measure the threshold; the
				// rest of the gesture works in user units.
				pressX: event.clientX,
				pressY: event.clientY,
			};
			return;
		}

		const path = pathAt(event.clientX, event.clientY);
		editor.select(path);
		if (path === null) return;

		editor.gesture = {
			kind: "move",
			path,
			startX: event.clientX,
			startY: event.clientY,
			dx: 0,
			dy: 0,
			moved: false,
		};
	}

	function startResize(event: PointerEvent, handle: ResizeHandle) {
		event.stopPropagation();
		if (editor.selectedPath === null) return;
		editor.gesture = {
			kind: "resize",
			path: editor.selectedPath,
			handle,
			startX: event.clientX,
			startY: event.clientY,
			dx: 0,
			dy: 0,
			moved: false,
		};
	}

	/** A client point in the SVG's own user units. */
	function toUserSpace(
		clientX: number,
		clientY: number,
	): { x: number; y: number } | null {
		const drawing = drawingRect();
		if (!drawing || !viewBox || drawing.width === 0 || drawing.height === 0) {
			return null;
		}
		return {
			x:
				viewBox.x +
				((clientX - drawing.left) / drawing.width) * viewBox.width,
			y:
				viewBox.y +
				((clientY - drawing.top) / drawing.height) * viewBox.height,
		};
	}

	function handlePointerMove(event: PointerEvent) {
		const gesture = editor.gesture;

		if (gesture.kind === "none") {
			// Only speak for the pointer while it is over the canvas. This
			// handler is on the window, so it sees moves across the whole page,
			// and answering for those overwrote the hover the layers panel had
			// just set -- boundary events fire before `pointermove`, so the
			// panel's value was undone within the same gesture, every time.
			if (editor.tool === "select" && isOverCanvas(event)) {
				editor.hoveredPath = pathAt(event.clientX, event.clientY);
			}
			return;
		}

		if (gesture.kind === "pan") {
			panX = gesture.panX + (event.clientX - gesture.startX);
			panY = gesture.panY + (event.clientY - gesture.startY);
			return;
		}

		if (gesture.kind === "draw") {
			const travelled = hasTravelled(
				event.clientX - gesture.pressX,
				event.clientY - gesture.pressY,
			);
			if (!gesture.moved && !travelled) return;

			const local = toUserSpace(event.clientX, event.clientY);
			if (local) {
				editor.gesture = {
					...gesture,
					x: local.x,
					y: local.y,
					moved: true,
				};
			}
			return;
		}

		const screenDx = event.clientX - gesture.startX;
		const screenDy = event.clientY - gesture.startY;
		// Below the threshold this is still a click, so nothing is previewed.
		if (!gesture.moved && !hasTravelled(screenDx, screenDy)) return;

		const perUnit = screenPerUnit();
		const dx = screenDx / perUnit;
		const dy = screenDy / perUnit;
		editor.gesture = { ...gesture, dx, dy, moved: true };

		// Preview by transforming the rendered element directly. Regenerating
		// per frame would re-encode every embedded image, which stalls on any
		// real photograph.
		const element = elementFor(gesture.path) as SVGElement | null;
		if (!element) return;
		if (gesture.kind === "move") {
			element.style.transform = `translate(${dx}px, ${dy}px)`;
			return;
		}

		// Preview a resize by scaling about the corner opposite the handle,
		// which is the corner that stays put.
		const box = userBoxFor(gesture.path);
		if (!box || box.width === 0 || box.height === 0) return;

		const left = gesture.handle === "nw" || gesture.handle === "sw";
		const top = gesture.handle === "nw" || gesture.handle === "ne";
		const scaleX = Math.max(1, box.width + (left ? -dx : dx)) / box.width;
		const scaleY = Math.max(1, box.height + (top ? -dy : dy)) / box.height;
		const anchorX = left ? box.x + box.width : box.x;
		const anchorY = top ? box.y + box.height : box.y;

		element.style.transform =
			`translate(${anchorX - anchorX * scaleX}px, ` +
			`${anchorY - anchorY * scaleY}px) scale(${scaleX}, ${scaleY})`;
	}

	/**
	 * Abandon the gesture in flight, leaving the document untouched.
	 *
	 * Both Escape and `pointercancel` land here. Without the second, a gesture
	 * the browser takes away -- a system swipe, a lost pointer capture -- leaves
	 * the element following the cursor with no button held.
	 */
	export function abortGesture(): boolean {
		const gesture = editor.gesture;
		if (gesture.kind === "none") return false;

		editor.gesture = { kind: "none" };
		if (gesture.kind === "move" || gesture.kind === "resize") {
			const element = elementFor(gesture.path) as SVGElement | null;
			if (element) element.style.transform = "";
		}
		return true;
	}

	/** Is the pointer within the canvas itself? */
	function isOverCanvas(event: PointerEvent): boolean {
		if (!container) return false;
		const rect = container.getBoundingClientRect();
		return (
			event.clientX >= rect.left &&
			event.clientX <= rect.right &&
			event.clientY >= rect.top &&
			event.clientY <= rect.bottom
		);
	}

	function handlePointerUp() {
		const gesture = editor.gesture;
		editor.gesture = { kind: "none" };
		if (gesture.kind === "none" || gesture.kind === "pan") return;

		if (gesture.kind === "draw") {
			// A tremor is not a shape.
			if (!gesture.moved) return;
			const x = Math.min(gesture.startX, gesture.x);
			const y = Math.min(gesture.startY, gesture.y);
			const width = Math.abs(gesture.x - gesture.startX);
			const height = Math.abs(gesture.y - gesture.startY);
			if (width > 0 && height > 0) onDraw(x, y, width, height);
			return;
		}

		// A press that never travelled is a click. It selected something, which
		// is all it should do.
		if (!gesture.moved) {
			clearPreview(gesture.path);
			return;
		}

		// The preview stays up until the regenerated drawing replaces it.
		// Clearing it here instead would snap the element back to where the drag
		// began and hold it there for the length of a write, an evaluation and
		// a reload -- a visible jump backwards before it lands.
		if (gesture.kind === "move") {
			if (!onMove(gesture.path, gesture.dx, gesture.dy)) {
				clearPreview(gesture.path);
			}
			return;
		}

		const box = userBoxFor(gesture.path);
		if (!box) {
			clearPreview(gesture.path);
			return;
		}
		const left = gesture.handle === "nw" || gesture.handle === "sw";
		const top = gesture.handle === "nw" || gesture.handle === "ne";
		const committed = onResize(
			gesture.path,
			box.x + (left ? gesture.dx : 0),
			box.y + (top ? gesture.dy : 0),
			Math.max(1, box.width + (left ? -gesture.dx : gesture.dx)),
			Math.max(1, box.height + (top ? -gesture.dy : gesture.dy)),
		);
		if (!committed) clearPreview(gesture.path);
	}

	/** Take the preview transform off an element, if it still has one. */
	function clearPreview(path: string) {
		const element = elementFor(path) as SVGElement | null;
		if (element) element.style.transform = "";
	}

	/** An element's box in the SVG's user units. */
	function userBoxFor(
		path: string,
	): { x: number; y: number; width: number; height: number } | null {
		const element = elementFor(path);
		if (
			!element ||
			typeof (element as SVGGraphicsElement).getBBox !== "function"
		) {
			return null;
		}
		const bbox = (element as SVGGraphicsElement).getBBox();
		return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
	}

	const drawPreview = $derived.by(() => {
		const gesture = editor.gesture;
		if (gesture.kind !== "draw" || !viewBox || !frame) return null;
		const perUnit = screenPerUnit();
		const origin = boxOrigin();
		if (!origin) return null;
		return {
			left:
				origin.left +
				(Math.min(gesture.startX, gesture.x) - viewBox.x) * perUnit,
			top:
				origin.top +
				(Math.min(gesture.startY, gesture.y) - viewBox.y) * perUnit,
			width: Math.abs(gesture.x - gesture.startX) * perUnit,
			height: Math.abs(gesture.y - gesture.startY) * perUnit,
		};
	});

	/** The container-relative position of the drawing's origin. */
	function boxOrigin(): { left: number; top: number } | null {
		const drawing = drawingRect();
		if (!drawing || !container) return null;
		const containerRect = container.getBoundingClientRect();
		return {
			left: drawing.left - containerRect.left,
			top: drawing.top - containerRect.top,
		};
	}
</script>

<svelte:window
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={() => abortGesture()}
/>

<!--
	A design canvas is an application widget: it takes keyboard focus so tool and
	nudge shortcuts have somewhere to land, and its own children are the
	interactive parts. `role="application"` says exactly that, and the rule that
	fires here does not model it.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="canvas"
	class:panning={editor.gesture.kind === "pan"}
	class:pannable={editor.tool === "pan"}
	class:drawing={editor.tool !== "select" && editor.tool !== "pan"}
	class:over-shape={editor.tool === "select" &&
		editor.hoveredPath !== null &&
		(editor.gesture.kind === "none" ||
			(editor.gesture.kind === "move" && !editor.gesture.moved))}
	class:moving={editor.gesture.kind === "move" && editor.gesture.moved}
	bind:this={container}
	bind:clientWidth={containerWidth}
	bind:clientHeight={containerHeight}
	onpointerdown={handlePointerDown}
	onpointerleave={() => {
		if (editor.gesture.kind === "none") editor.hoveredPath = null;
	}}
	onwheel={handleWheel}
	role="application"
	aria-label="Design canvas"
	tabindex="0"
>
	<div
		class="stage"
		style:--pan-x="{panX}px"
		style:--pan-y="{panY}px"
		style:--scale={scale}
	>
		<iframe
			bind:this={frame}
			title="Design canvas contents"
			sandbox="allow-same-origin"
			srcdoc={frameDocument}
			width={constrained.width}
			height={constrained.height}
			style:width="{constrained.width}px"
			style:height="{constrained.height}px"
			onload={() => (frameRevision += 1)}
		></iframe>
	</div>

	<div class="overlay">
		{#each groupBoxes as box, i (i)}
			<div
				class="outline group"
				style:left="{box.left}px"
				style:top="{box.top}px"
				style:width="{box.width}px"
				style:height="{box.height}px"
			></div>
		{/each}

		{#if hoverBox}
			<div
				class="outline hover"
				style:left="{hoverBox.left}px"
				style:top="{hoverBox.top}px"
				style:width="{hoverBox.width}px"
				style:height="{hoverBox.height}px"
			></div>
		{/if}

		{#if selectionBox}
			<div
				class="outline selected"
				style:left="{selectionBox.left}px"
				style:top="{selectionBox.top}px"
				style:width="{selectionBox.width}px"
				style:height="{selectionBox.height}px"
			></div>
			{#each canResize ? HANDLES : [] as handle (handle)}
				<button
					type="button"
					class="handle {handle}"
					aria-label="Resize {handle}"
					style:left="{selectionBox.left +
						(handle === 'ne' || handle === 'se'
							? selectionBox.width
							: 0)}px"
					style:top="{selectionBox.top +
						(handle === 'sw' || handle === 'se'
							? selectionBox.height
							: 0)}px"
					onpointerdown={event => startResize(event, handle)}
				></button>
			{/each}
		{/if}

		{#if drawPreview}
			<div
				class="outline drawing-preview"
				style:left="{drawPreview.left}px"
				style:top="{drawPreview.top}px"
				style:width="{drawPreview.width}px"
				style:height="{drawPreview.height}px"
			></div>
		{/if}
	</div>
</div>

<style>
	.canvas {
		position: relative;
		flex: 1;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		background: #f9fafb;
		background-image:
			linear-gradient(45deg, #e5e7eb 25%, transparent 25%),
			linear-gradient(-45deg, #e5e7eb 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, #e5e7eb 75%),
			linear-gradient(-45deg, transparent 75%, #e5e7eb 75%);
		background-size: 16px 16px;
		background-position:
			0 0,
			0 8px,
			8px -8px,
			-8px 0;
		cursor: default;
	}

	.canvas:focus-visible {
		outline: 2px solid #2563eb;
		outline-offset: -2px;
	}

	/* The pan tool has to look grabbable before it is grabbed. */
	.canvas.pannable {
		cursor: grab;
	}

	.canvas.panning,
	.canvas.moving {
		cursor: grabbing;
	}

	.canvas.over-shape {
		cursor: move;
	}

	.canvas.drawing {
		cursor: crosshair;
	}

	.stage {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		transform: translate(var(--pan-x), var(--pan-y)) scale(var(--scale));
		transform-origin: center;
	}

	iframe {
		border: 0;
		background: #fff;
		/* Gestures are handled by the container, which hit-tests through
		   `contentDocument`. Letting the frame take pointer events would
		   swallow every drag. */
		pointer-events: none;
	}

	.overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.outline {
		position: absolute;
		box-sizing: border-box;
		pointer-events: none;
	}

	.outline.hover {
		outline: 1px dashed #6b7280;
	}

	.outline.selected {
		outline: 1.5px solid #2563eb;
	}

	.outline.group {
		outline: 1px dashed #2563eb;
		opacity: 0.55;
	}

	.outline.drawing-preview {
		outline: 1.5px dashed #2563eb;
		background: rgb(37 99 235 / 12%);
	}

	.handle {
		position: absolute;
		width: 9px;
		height: 9px;
		margin: -5px 0 0 -5px;
		padding: 0;
		border: 1px solid #2563eb;
		border-radius: 2px;
		background: #fff;
		pointer-events: auto;
	}

	.handle.nw {
		cursor: nwse-resize;
	}
	.handle.ne {
		cursor: nesw-resize;
	}
	.handle.sw {
		cursor: nesw-resize;
	}
	.handle.se {
		cursor: nwse-resize;
	}
</style>
