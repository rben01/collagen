/**
 * Building the layers tree from an evaluated manifest.
 *
 * The tree mirrors the structural paths provenance and SVG generation both use,
 * so a row, a rendered element, and a source position all name the same thing.
 */

import type { JsonObject } from "../../collagen-ts/jsonnet/index.js";
import {
	childPath,
	type Provenance,
} from "../../collagen-ts/manifest/provenance.js";

export interface LayerNode {
	/** Structural path, matching `data-clgn-path` on the rendered element. */
	path: string;
	/** The path of this node's parent, for reordering within one list. */
	parentPath: string;
	/** This node's index among its siblings. */
	index: number;
	depth: number;
	label: string;
	/** How many elements share this node's source construct. */
	groupSize: number;
	/**
	 * Can this node be hidden?
	 *
	 * Only tags with an `attrs` object can, since hiding writes
	 * `display: none` there. Bare text children have nowhere to put it.
	 */
	canHide: boolean;
	/** False when this element is currently hidden. */
	visible: boolean;
	children: LayerNode[];
}

/** A short, recognizable name for a manifest node. */
function labelFor(value: Record<string, JsonObject>): string {
	if (typeof value.tag === "string") return `<${value.tag}>`;
	if (typeof value.image_path === "string") {
		return `image ${basename(value.image_path)}`;
	}
	if (typeof value.clgn_path === "string") {
		return `skeleton ${basename(value.clgn_path)}`;
	}
	if (typeof value.svg_path === "string") {
		return `svg ${basename(value.svg_path)}`;
	}
	if (value.fonts !== undefined) return "fonts";
	if (typeof value.text === "string") return quote(value.text);
	return "element";
}

/**
 * The SVG element a manifest node renders as, when its geometry can be edited.
 *
 * Mirrors the dispatch in `svg/index.ts`: a generic tag renders as itself, an
 * `image_path` as `<image>`, an `svg_path` as a `<g>` wrapping the file.
 *
 * Null means there is nowhere to write a geometry change, for one of two
 * reasons. A text child renders as bare escaped text with no element of its
 * own. And a `clgn_path` container renders as a `<g>` but its schema accepts
 * *only* that key -- `validateContainerTag` rejects `attrs` outright -- so
 * writing a transform onto one would break the manifest. A `fonts` block
 * renders as `<defs>`, which has no geometry to speak of.
 */
export function editableElementName(value: JsonObject): string | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}

	const object = value as Record<string, JsonObject>;
	if (typeof object.tag === "string") return object.tag;
	if (typeof object.image_path === "string") return "image";
	if (typeof object.svg_path === "string") return "g";
	return null;
}

function basename(path: string): string {
	const slash = path.lastIndexOf("/");
	return slash === -1 ? path : path.slice(slash + 1);
}

function quote(text: string): string {
	const trimmed = text.trim();
	const shortened = trimmed.length > 24 ? `${trimmed.slice(0, 23)}…` : trimmed;
	return `"${shortened}"`;
}

/** The children of a manifest node, with a lone child treated as a list of one. */
function childrenOf(value: Record<string, JsonObject>): JsonObject[] {
	const children = value.children;
	if (children === null || children === undefined) return [];
	return Array.isArray(children) ? children : [children];
}

/**
 * Build the layers tree.
 *
 * Text children have no element of their own in the output -- `generateTextTag`
 * emits bare escaped text -- so they appear as rows but never as hit targets,
 * and the inspector edits them through their parent.
 */
export function buildLayers(
	root: JsonObject,
	provenance: Provenance | null,
): LayerNode[] {
	if (root === null || typeof root !== "object" || Array.isArray(root)) {
		return [];
	}
	return childrenOf(root as Record<string, JsonObject>).map((child, index) =>
		buildNode(child, "", index, 0, provenance),
	);
}

function buildNode(
	value: JsonObject,
	parentPath: string,
	index: number,
	depth: number,
	provenance: Provenance | null,
): LayerNode {
	const path = childPath(parentPath, index);

	if (typeof value === "string") {
		return {
			path,
			parentPath,
			index,
			depth,
			label: quote(value),
			groupSize: 1,
			canHide: false,
			visible: true,
			children: [],
		};
	}

	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return {
			path,
			parentPath,
			index,
			depth,
			label: "element",
			groupSize: 1,
			canHide: false,
			visible: true,
			children: [],
		};
	}

	const object = value as Record<string, JsonObject>;
	const ref = provenance?.sourceOf.get(path);
	const groupSize = ref
		? (provenance?.multiplicity.get(`${ref.fileIndex}:${ref.braceFrom}`) ?? 1)
		: 1;

	const attrs = object.attrs;
	const display =
		attrs !== null && typeof attrs === "object" && !Array.isArray(attrs)
			? (attrs as Record<string, JsonObject>).display
			: undefined;

	return {
		path,
		parentPath,
		index,
		depth,
		label: labelFor(object),
		groupSize,
		canHide: typeof object.tag === "string",
		visible: display !== "none",
		children: childrenOf(object).map((child, i) =>
			buildNode(child, path, i, depth + 1, provenance),
		),
	};
}

/** Every path whose element shares a source construct with `path`. */
export function groupOf(path: string, provenance: Provenance | null): string[] {
	const ref = provenance?.sourceOf.get(path);
	if (!ref || !provenance) return [];

	const shared: string[] = [];
	for (const [candidate, other] of provenance.sourceOf) {
		if (
			other.fileIndex === ref.fileIndex &&
			other.braceFrom === ref.braceFrom
		) {
			shared.push(candidate);
		}
	}
	return shared;
}

/** The manifest node a structural path names, or null. */
export function nodeAtPath(root: JsonObject, path: string): JsonObject | null {
	if (path === "") return root;

	let node = root;
	for (const step of path.split(".")) {
		const match = /^children\[(\d+)\]$/.exec(step);
		if (!match) return null;
		if (node === null || typeof node !== "object" || Array.isArray(node)) {
			return null;
		}
		const children = childrenOf(node as Record<string, JsonObject>);
		const next = children[Number(match[1])];
		if (next === undefined) return null;
		node = next;
	}
	return node;
}

/** The parent path and index a structural path resolves to. */
export function splitPath(
	path: string,
): { parentPath: string; index: number } | null {
	const at = path.lastIndexOf(".children[");
	const step = at === -1 ? path : path.slice(at + 1);
	const match = /^children\[(\d+)\]$/.exec(step);
	if (!match) return null;
	return {
		parentPath: at === -1 ? "" : path.slice(0, at),
		index: Number(match[1]),
	};
}
