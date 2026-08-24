<script lang="ts">
	import {
		getManifestPath,
		InMemoryFileSystem,
	} from "$lib/collagen-ts/filesystem/index.js";
	import type { JsonObject } from "$lib/collagen-ts/jsonnet/index.js";
	import {
		attributeSources,
		detachComprehension,
		printElement,
		removeAttribute,
		setAttribute,
		moveChild,
		insertChild,
		removeChild,
		setAttributeExpression,
		type AttributeSource,
		type EditOutcome,
	} from "$lib/collagen-ts/manifest/edit.js";
	import {
		changedEdits,
		composeTranslate,
		fitInside,
		type Box,
		resizeEdits,
		translateEdits,
		type AttrEdit,
	} from "$lib/collagen-ts/manifest/geometry.js";
	import {
		childPath,
		type Provenance,
	} from "$lib/collagen-ts/manifest/provenance.js";
	import type { XmlAttrs } from "$lib/collagen-ts/types/index.js";
	import { isTypingInInput } from "../viewer/index.js";
	import CanvasViewport from "./CanvasViewport.svelte";
	import ImagePicker, { type ProjectImage } from "./ImagePicker.svelte";
	import Inspector, { type AttrRow } from "./Inspector.svelte";
	import LayersPanel from "./LayersPanel.svelte";
	import ToolPalette from "./ToolPalette.svelte";
	import { EditorState, type Tool } from "./editor-state.svelte.js";
	import {
		buildLayers,
		editableElementName,
		groupOf,
		nodeAtPath,
		splitPath,
		type LayerNode,
	} from "./layers.js";

	let {
		filesData = $bindable(),
		editor,
	}: { filesData: { fs: InMemoryFileSystem }; editor: EditorState } = $props();

	let annotatedSvg = $state<string | null>(null);
	let manifest = $state<JsonObject>(null);
	let provenance = $state<Provenance | null>(null);
	let analysisError = $state<string | null>(null);

	let projectImages = $state<ProjectImage[]>([]);

	let scale = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let canvas: CanvasViewport | null = $state(null);

	const textEncoder = new TextEncoder();
	const textDecoder = new TextDecoder();

	/** Discards stale async results when edits land faster than they finish. */
	let generation = 0;

	$effect(() => {
		const { fs } = filesData;
		if (fs.getFileCount() === 0) {
			annotatedSvg = null;
			return;
		}

		const thisGeneration = ++generation;

		Promise.all([fs.analyzeManifest(), fs.generateSvg({ annotate: true })])
			.then(([analysis, svg]) => {
				if (thisGeneration !== generation) return;
				annotatedSvg = svg;
				manifest = analysis.value;
				provenance = analysis.ok ? analysis.provenance : null;
				editor.readOnlyReason = analysis.ok ? null : analysis.reason;
				analysisError = null;
			})
			.catch((error: unknown) => {
				if (thisGeneration !== generation) return;
				analysisError =
					error instanceof Error ? error.message : String(error);
			});
	});

	const layers = $derived(buildLayers(manifest, provenance));

	const selectedNode = $derived(
		editor.selectedPath === null
			? null
			: nodeAtPath(manifest, editor.selectedPath),
	);

	/**
	 * How the selection's attributes are written, keyed by name.
	 *
	 * For an element a loop produced, every instance shares one source object,
	 * so these are the loop body's own expressions.
	 */
	const attributeText = $derived.by(() => {
		const target = readManifest();
		const brace =
			editor.selectedPath === null ? null : braceFor(editor.selectedPath);
		if (!target || brace === null) return new Map<string, AttributeSource>();
		return attributeSources(target.source, brace);
	});

	const selectedAttrs = $derived.by(() => {
		if (
			selectedNode === null ||
			typeof selectedNode !== "object" ||
			Array.isArray(selectedNode)
		) {
			return [];
		}
		const attrs = (selectedNode as Record<string, JsonObject>).attrs;
		if (attrs === null || typeof attrs !== "object" || Array.isArray(attrs)) {
			return [];
		}
		const rows: AttrRow[] = [];
		for (const key in attrs as Record<string, JsonObject>) {
			const value = (attrs as Record<string, JsonObject>)[key];
			if (typeof value !== "string" && typeof value !== "number") continue;

			// Carry the source text for every attribute the manifest spells
			// out, literal or not. The panel shows a computed one as code
			// straight away, and lets a literal be switched to code on request.
			const written = attributeText.get(key);
			rows.push({
				key,
				value,
				source: written?.text,
				isLiteral: written?.isLiteral ?? true,
			});
		}
		return rows;
	});

	const selectedLabel = $derived.by(() => {
		if (editor.selectedPath === null) return null;
		return findLabel(layers, editor.selectedPath);
	});

	function findLabel(nodes: LayerNode[], path: string): string | null {
		for (const node of nodes) {
			if (node.path === path) return node.label;
			const found = findLabel(node.children, path);
			if (found !== null) return found;
		}
		return null;
	}

	const selectionGroup = $derived(
		editor.selectedPath === null
			? []
			: groupOf(editor.selectedPath, provenance),
	);

	/** Whether the shared source construct is a loop, or shared code. */
	const groupKind = $derived.by((): "loop" | "shared" | null => {
		if (selectionGroup.length <= 1 || editor.selectedPath === null)
			return null;
		// Siblings under one parent are what a comprehension produces. A shared
		// constructor is instead called from several places, so its results land
		// under different parents.
		const parents = new Set(
			selectionGroup.map(path => splitPath(path)?.parentPath),
		);
		return parents.size === 1 ? "loop" : "shared";
	});

	$effect(() => {
		canvas?.setGroup(selectionGroup);
	});

	const selectedTagName = $derived.by(() => {
		if (
			selectedNode === null ||
			typeof selectedNode !== "object" ||
			Array.isArray(selectedNode)
		) {
			return null;
		}
		const tag = (selectedNode as Record<string, JsonObject>).tag;
		return typeof tag === "string" ? tag : null;
	});

	function readManifest(): { path: string; source: string } | null {
		try {
			const { format, content } = filesData.fs.loadManifestContents();
			return {
				path: getManifestPath(format),
				source: textDecoder.decode(content.bytes),
			};
		} catch {
			return null;
		}
	}

	/**
	 * Undo history, as whole-source snapshots.
	 *
	 * A manifest is a few kilobytes, so snapshots cost nothing, and every
	 * operation here is already a whole-source rewrite. This is per-mode: the
	 * text editor keeps CodeMirror's own history, which does not see these
	 * edits. Sharing one stack across both would mean keeping a CodeMirror
	 * EditorState alive for every file whether or not its editor is open.
	 */
	let undoStack = $state<string[]>([]);
	let redoStack = $state<string[]>([]);
	const HISTORY_LIMIT = 100;

	/** Write the manifest with no history bookkeeping. */
	function putManifest(path: string, source: string) {
		filesData.fs.addFileContents(path, textEncoder.encode(source), true);
		filesData = { fs: filesData.fs };
	}

	function writeManifest(path: string, source: string) {
		const current = readManifest();
		if (current && current.source !== source) {
			undoStack = [...undoStack.slice(-(HISTORY_LIMIT - 1)), current.source];
			redoStack = [];
		}
		putManifest(path, source);
	}

	function undo() {
		const current = readManifest();
		if (!current || undoStack.length === 0) return;
		const previous = undoStack[undoStack.length - 1];
		undoStack = undoStack.slice(0, -1);
		redoStack = [...redoStack, current.source];
		editor.notice = null;
		putManifest(current.path, previous);
	}

	function redo() {
		const current = readManifest();
		if (!current || redoStack.length === 0) return;
		const next = redoStack[redoStack.length - 1];
		redoStack = redoStack.slice(0, -1);
		undoStack = [...undoStack, current.source];
		editor.notice = null;
		putManifest(current.path, next);
	}

	/** The source offset of the object literal that produced `path`. */
	function braceFor(path: string): number | null {
		return provenance?.sourceOf.get(path)?.braceFrom ?? null;
	}

	/**
	 * Apply several attribute edits to one element, as a single change.
	 *
	 * Every splice lands inside the tag's own braces, which come after the
	 * offset itself, so the offset stays valid across all of them.
	 */
	/**
	 * What an edit did.
	 *
	 * The canvas needs "unchanged" and "refused" told apart from "changed",
	 * because only the last brings a regenerated drawing to replace the preview
	 * it is holding.
	 */
	type EditResult = "changed" | "unchanged" | "refused";

	function applyEdits(
		path: string,
		edits: AttrEdit[],
		{
			quiet = false,
			overrideComputed = true,
		}: { quiet?: boolean; overrideComputed?: boolean } = {},
	): EditResult {
		const target = readManifest();
		const brace = braceFor(path);
		if (!target || brace === null) {
			if (!quiet) {
				editor.notice =
					"This element cannot be edited here. Edit it as text.";
			}
			return "refused";
		}

		const changes = changedEdits(attrsAt(path), edits);
		if (changes.length === 0) return "unchanged";

		let source = target.source;
		for (const edit of changes) {
			const outcome: EditOutcome = setAttribute(
				source,
				brace,
				edit.key,
				edit.value,
				{ overrideComputed },
			);
			if (!outcome.ok) {
				if (!quiet) editor.notice = outcome.reason;
				return "refused";
			}
			source = outcome.source;
		}

		editor.notice = null;
		writeManifest(target.path, source);
		return "changed";
	}

	function commitOutcome(outcome: EditOutcome, path: string) {
		if (!outcome.ok) {
			editor.notice = outcome.reason;
			return;
		}
		editor.notice = null;
		writeManifest(path, outcome.source);
	}

	function handleMove(path: string, dx: number, dy: number): boolean {
		const tagName = tagNameAt(path);
		if (tagName === null) {
			editor.notice = "This element has no position of its own to change.";
			return false;
		}

		const attrs = attrsAt(path);

		// Editing `x` and `y` is preferred: those are what the author wrote and
		// what they will read back.
		// `overrideComputed: false` matters for an element a loop produced. A
		// drag is a relative motion, and merging an absolute coordinate onto
		// the shared template would stack every instance on one spot.
		const direct = translateEdits(tagName, attrs, dx, dy);
		if (direct) {
			const result = applyEdits(path, direct, {
				quiet: true,
				overrideComputed: false,
			});
			if (result !== "refused") return result === "changed";
		}

		// They may be expressions, though, as anything inside a loop usually is.
		// A transform composes on top of whatever they evaluate to, so dragging
		// keeps working where overwriting the expression would not.
		return (
			applyEdits(path, [
				{
					key: "transform",
					value: composeTranslate(attrs.transform, dx, dy),
				},
			]) === "changed"
		);
	}

	function handleResize(
		path: string,
		x: number,
		y: number,
		width: number,
		height: number,
	): boolean {
		const tagName = tagNameAt(path);
		if (tagName === null) {
			// Silence here was the worst of it: the handles are drawn from the
			// rendered element's own tag, so they appeared and did nothing.
			editor.notice = "This element has no size of its own to change.";
			return false;
		}

		const edits = resizeEdits(tagName, x, y, width, height);
		if (!edits) {
			editor.notice = `A <${tagName}> has no width and height to set. Move it instead, or edit it as text.`;
			return false;
		}
		// Same reasoning as a move: an absolute size merged onto a shared
		// template would make every instance identical.
		return applyEdits(path, edits, { overrideComputed: false }) === "changed";
	}

	/**
	 * What kind of SVG element this path renders as, for the geometry helpers.
	 *
	 * Reading `tag` alone was wrong: an image element's primary key is
	 * `image_path` and it carries no `tag`, so every image refused to move and
	 * resized silently, with four live handles drawn over it.
	 */
	function tagNameAt(path: string): string | null {
		return editableElementName(nodeAtPath(manifest, path));
	}

	function attrsAt(path: string): XmlAttrs {
		const node = nodeAtPath(manifest, path);
		if (node === null || typeof node !== "object" || Array.isArray(node)) {
			return {};
		}
		const attrs = (node as Record<string, JsonObject>).attrs;
		if (attrs === null || typeof attrs !== "object" || Array.isArray(attrs)) {
			return {};
		}
		const out: XmlAttrs = {};
		for (const key in attrs as Record<string, JsonObject>) {
			const value = (attrs as Record<string, JsonObject>)[key];
			if (typeof value === "string" || typeof value === "number") {
				out[key] = value;
			}
		}
		return out;
	}

	/** The element a drawing tool creates, as manifest text. */
	function newElement(
		tool: Tool,
		source: string,
		x: number,
		y: number,
		width: number,
		height: number,
	): string | null {
		const round = (n: number) => Number(n.toFixed(2));
		switch (tool) {
			case "rect":
				return printElement(source, "tag", "rect", {
					x: round(x),
					y: round(y),
					width: round(width),
					height: round(height),
					fill: "#3b82f6",
				});
			case "ellipse":
				return printElement(source, "tag", "ellipse", {
					cx: round(x + width / 2),
					cy: round(y + height / 2),
					rx: round(width / 2),
					ry: round(height / 2),
					fill: "#3b82f6",
				});
			case "line":
				return printElement(source, "tag", "line", {
					x1: round(x),
					y1: round(y),
					x2: round(x + width),
					y2: round(y + height),
					stroke: "#111827",
					"stroke-width": 2,
				});
			case "image": {
				const chosen = editor.imagePath;
				if (chosen === null) return null;

				const box = fitToBox(chosen, { x, y, width, height });
				return printElement(source, "image_path", chosen, {
					x: round(box.x),
					y: round(box.y),
					width: round(box.width),
					height: round(box.height),
				});
			}
			case "text":
				return printElement(
					source,
					"tag",
					"text",
					{
						x: round(x),
						y: round(y + height),
						"font-size": Math.max(8, round(height)),
						fill: "#111827",
					},
					"Text",
				);
			default:
				return null;
		}
	}

	/** The box an image should occupy when placed in the box that was drawn. */
	function fitToBox(path: string, box: Box): Box {
		const image = projectImages.find(candidate => candidate.path === path);
		return fitInside(
			box,
			image?.naturalWidth ?? null,
			image?.naturalHeight ?? null,
		);
	}

	function handleDraw(x: number, y: number, width: number, height: number) {
		const target = readManifest();
		if (!target) return;

		if (editor.tool === "image" && editor.imagePath === null) {
			editor.notice = "Choose an image on the right first.";
			return;
		}

		const elementText = newElement(
			editor.tool,
			target.source,
			x,
			y,
			width,
			height,
		);
		if (elementText === null) return;

		const rootBrace = braceFor("");
		if (rootBrace === null) {
			editor.notice =
				"This manifest cannot be edited here. Edit it as text.";
			return;
		}

		const childCount = layers.length;
		const outcome = insertChild(
			target.source,
			rootBrace,
			childCount,
			elementText,
			// The evaluated manifest settles what a computed `children` really
			// is, which the source alone cannot say.
			{ childrenAreList: rootChildrenAreList() },
		);
		commitOutcome(outcome, target.path);
		if (outcome.ok) {
			editor.tool = "select";
			editor.select(`children[${childCount}]`);
		}
	}

	/** Does the root's `children` evaluate to a list, rather than a lone child? */
	function rootChildrenAreList(): boolean {
		if (manifest === null || typeof manifest !== "object") return true;
		const children = (manifest as Record<string, JsonObject>).children;
		// Absent children become a new list, so either answer serves.
		return children === undefined || children === null
			? true
			: Array.isArray(children);
	}

	function handleSetAttr(key: string, value: string) {
		if (editor.selectedPath === null) return;
		// A field the user typed as a number should stay a number in the
		// manifest, so it keeps working with arithmetic there.
		const asNumber = Number(value);
		const parsed =
			value.trim() !== "" && Number.isFinite(asNumber) ? asNumber : value;
		applyEdits(editor.selectedPath, [{ key, value: parsed }]);
	}

	/**
	 * Replace an attribute with raw Jsonnet.
	 *
	 * Where the selection came from a loop this rewrites the loop body, so
	 * every instance changes -- which is the point of showing the expression
	 * rather than one instance's value.
	 */
	function handleSetExpression(key: string, expression: string) {
		const target = readManifest();
		const brace =
			editor.selectedPath === null ? null : braceFor(editor.selectedPath);
		if (!target || brace === null) return;

		commitOutcome(
			setAttributeExpression(target.source, brace, key, expression),
			target.path,
		);
	}

	function handleRemoveAttr(key: string) {
		const target = readManifest();
		const brace =
			editor.selectedPath === null ? null : braceFor(editor.selectedPath);
		if (!target || brace === null) return;
		commitOutcome(removeAttribute(target.source, brace, key), target.path);
	}

	/**
	 * Show or hide one element.
	 *
	 * Written as `display: none` in `attrs`, so it lives in the manifest and
	 * survives a reload -- unlike a lock, which is only ever a hint to the
	 * person editing and has no business in the output.
	 */
	function handleToggleVisible(path: string, visible: boolean) {
		const target = readManifest();
		const brace = braceFor(path);
		if (!target || brace === null) {
			editor.notice = "This element cannot be hidden here. Edit it as text.";
			return;
		}

		commitOutcome(
			visible
				? removeAttribute(target.source, brace, "display")
				: setAttribute(target.source, brace, "display", "none"),
			target.path,
		);
	}

	function handleReorder(parentPath: string, from: number, to: number) {
		const target = readManifest();
		const brace = braceFor(parentPath);
		if (!target || brace === null) {
			editor.notice = "These layers cannot be reordered here. Edit as text.";
			return;
		}

		const outcome = moveChild(target.source, brace, from, to);
		commitOutcome(outcome, target.path);
		if (outcome.ok) followReorder(parentPath, from, to);
	}

	/**
	 * Keep the selection on the element it was on.
	 *
	 * A path is an index, so reordering renumbers siblings underneath it. Left
	 * alone, dragging a layer past the selected one silently moves the
	 * selection to whatever now sits at that index.
	 */
	function followReorder(parentPath: string, from: number, to: number) {
		editor.selectedPath = renumber(editor.selectedPath, parentPath, from, to);
		editor.hoveredPath = renumber(editor.hoveredPath, parentPath, from, to);
	}

	/** `path` after the element at `from` moves to `to` among its siblings. */
	function renumber(
		path: string | null,
		parentPath: string,
		from: number,
		to: number,
	): string | null {
		if (path === null) return null;

		const where = splitPath(path);
		if (!where || where.parentPath !== parentPath) return path;

		const moved = shiftIndex(where.index, from, to);
		return moved === where.index ? path : childPath(parentPath, moved);
	}

	/** Where index `i` ends up once the element at `from` moves to `to`. */
	function shiftIndex(i: number, from: number, to: number): number {
		if (i === from) return to;
		if (from < to && i > from && i <= to) return i - 1;
		if (to < from && i >= to && i < from) return i + 1;
		return i;
	}

	function handleDetach() {
		const target = readManifest();
		const path = editor.selectedPath;
		const brace = path === null ? null : braceFor(path);
		if (!target || path === null || brace === null) return;

		// The elements the loop produced, in render order, taken from the plain
		// evaluation so no marker is baked into the source.
		const values: JsonObject[] = [];
		for (const sibling of selectionGroup.slice().sort(byIndex)) {
			const node = nodeAtPath(manifest, sibling);
			if (node !== null) values.push(node);
		}

		commitOutcome(
			detachComprehension(target.source, brace, values),
			target.path,
		);
	}

	function byIndex(a: string, b: string): number {
		return (splitPath(a)?.index ?? 0) - (splitPath(b)?.index ?? 0);
	}

	function handleDelete() {
		const path = editor.selectedPath;
		const target = readManifest();
		const where = path === null ? null : splitPath(path);
		if (!target || !where) return;

		const brace = braceFor(where.parentPath);
		if (brace === null) {
			editor.notice =
				"This element cannot be removed here. Edit it as text.";
			return;
		}

		const outcome = removeChild(target.source, brace, where.index);
		commitOutcome(outcome, target.path);
		if (outcome.ok) editor.select(null);
	}

	const TOOL_KEYS: Record<string, Tool> = {
		v: "select",
		r: "rect",
		e: "ellipse",
		l: "line",
		t: "text",
		i: "image",
		h: "pan",
	};

	/**
	 * Editor shortcuts.
	 *
	 * A window listener is safe here because this component only exists while
	 * the visual editor is on screen, and `SvgDisplay` ignores keys unless it is
	 * the active pane -- so the two never both act on one press.
	 */
	function handleKeydown(event: KeyboardEvent) {
		if (isTypingInInput()) return;

		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
			event.preventDefault();
			if (event.shiftKey) redo();
			else undo();
			return;
		}

		if (event.metaKey || event.ctrlKey || event.altKey) return;

		if (event.key === "Escape") {
			// A drag in flight is the more immediate thing to call off, and
			// abandoning it must not also throw away the selection.
			if (canvas?.abortGesture()) return;
			editor.select(null);
			return;
		}

		if (event.key === "Delete" || event.key === "Backspace") {
			if (editor.selectedPath === null) return;
			event.preventDefault();
			handleDelete();
			return;
		}

		const tool = TOOL_KEYS[event.key.toLowerCase()];
		if (tool) {
			event.preventDefault();
			editor.tool = tool;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="gui-editor">
	<ToolPalette {editor} />

	<div class="canvas-area">
		{#if analysisError}
			<p class="error">{analysisError}</p>
		{:else if annotatedSvg}
			<CanvasViewport
				bind:this={canvas}
				svg={annotatedSvg}
				{editor}
				bind:scale
				bind:panX
				bind:panY
				onMove={handleMove}
				onResize={handleResize}
				onDraw={handleDraw}
			/>
		{:else}
			<p class="error">Nothing to draw yet.</p>
		{/if}
	</div>

	<aside class="panels">
		<!--
			Notices live here rather than in the Inspector, which the image
			picker replaces: a refusal has to be readable whichever panel is
			showing, and "choose an image first" appears precisely when the
			Inspector is not on screen.
		-->
		{#if editor.readOnlyReason}
			<p class="notice read-only">{editor.readOnlyReason}</p>
		{/if}
		{#if editor.notice}
			<p class="notice">{editor.notice}</p>
		{/if}

		<LayersPanel
			{layers}
			{editor}
			onReorder={handleReorder}
			onToggleVisible={handleToggleVisible}
		/>
		{#if editor.tool === "image"}
			<ImagePicker
				filesystem={filesData.fs}
				bind:selected={editor.imagePath}
				bind:images={projectImages}
			/>
		{:else}
			<Inspector
				tagLabel={selectedLabel ?? selectedTagName}
				attrs={selectedAttrs}
				groupSize={selectionGroup.length}
				{groupKind}
				canDetach={groupKind === "loop"}
				onSet={handleSetAttr}
				onSetExpression={handleSetExpression}
				onRemove={handleRemoveAttr}
				onDetach={handleDetach}
			/>
		{/if}
	</aside>
</div>

<style>
	.gui-editor {
		display: flex;
		flex: 1;
		min-width: 0;
		min-height: 0;
	}

	.canvas-area {
		display: flex;
		flex: 1;
		min-width: 0;
		min-height: 0;
	}

	.panels {
		display: flex;
		flex-direction: column;
		flex: 0 0 15rem;
		min-height: 0;
		border-left: 1px solid #e5e7eb;
		background: #fff;
	}

	.panels > :global(.layers) {
		flex: 1 1 45%;
	}

	.panels > :global(.inspector),
	.panels > :global(.picker) {
		flex: 1 1 55%;
	}

	.notice {
		flex: 0 0 auto;
		margin: 0;
		padding: 0.5em 0.75em;
		background: #fef2f2;
		color: #b91c1c;
		font-size: 0.8em;
	}

	.notice.read-only {
		background: #fffbeb;
		color: #92400e;
	}

	.error {
		margin: auto;
		padding: 2em;
		color: #6b7280;
		text-align: center;
	}
</style>
