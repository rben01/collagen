/**
 * Mapping rendered SVG elements back to the manifest source that produced them.
 *
 * The problem is that Jsonnet evaluates one way. A loop turns one source
 * construct into N elements, and sjsonnet returns bare JSON with no positions.
 *
 * The trick is to instrument the source before evaluating it: insert a marker
 * field into every object literal holding that literal's own offset. Jsonnet
 * objects carry their fields wherever they flow, so afterwards every object in
 * the output knows which source construct produced it -- and all N objects a
 * loop produced share one marker, because they came from one literal. That
 * shared marker is the grouping signal, with no source mapping and no static
 * analysis.
 *
 * The marker never reaches validation. Callers get a stripped value tree plus a
 * separate path-to-source map, so nothing downstream has to tolerate a foreign
 * key.
 */

import type { InMemoryFileSystem } from "../filesystem/index.js";
import { compileJsonnet, type JsonObject } from "../jsonnet/index.js";
import type { SyntaxNode } from "@lezer/common";
import {
	arrayElements,
	decodeStringLiteral,
	findField,
	firstParseError,
	objectBodies,
	parseManifest,
} from "./cst.js";

/** The field name injected into instrumented object literals. */
const MARKER = "__clgn_src";

/**
 * Only object literals holding one of these keys are instrumented.
 *
 * This is what keeps the trick safe in practice. An extra field is observable
 * through `std.objectFields`, `std.length`, `==`, and `std.manifestJson`, so
 * instrumenting every object would perturb evaluation routinely. These keys
 * mark the objects that become SVG elements, which are precisely the ones a
 * manifest does not enumerate. Note that `name`, `path`, and `bundled` are
 * absent: font faces need no marker, and leaving them alone keeps markers out
 * of `fonts` entirely.
 */
const TAG_KEYS = new Set([
	"tag",
	"image_path",
	"text",
	"clgn_path",
	"fonts",
	"svg_path",
	"attrs",
	"children",
]);

/** Where in the source an element came from. */
export interface SourceRef {
	/** Index into `Provenance.files`. Always 0 until nested files become editable. */
	fileIndex: number;
	/** Offset of the `{` opening the object literal that produced the element. */
	braceFrom: number;
}

export interface Provenance {
	/** Structural path (`children[2].children[0]`) to where it came from. */
	sourceOf: Map<string, SourceRef>;
	/**
	 * Marker to how many elements carry it.
	 *
	 * This is the operative grouping test, not "did this come from a loop".
	 * `local mk(c) = {tag: "rect", fill: c}; children: [mk("red"), mk("blue")]`
	 * shares a literal with no comprehension anywhere.
	 */
	multiplicity: Map<string, number>;
	/** Source text by file index. */
	files: string[];
}

export type ProvenanceResult =
	/** The manifest was analyzed. The GUI can edit it. */
	| { ok: true; value: JsonObject; provenance: Provenance }
	/**
	 * The manifest evaluated but could not be analyzed. The GUI can render and
	 * select, but not edit. `reason` is shown to the user.
	 */
	| { ok: false; value: JsonObject; reason: string };

/** Marker text for a source offset. */
function markerFor(fileIndex: number, braceFrom: number): string {
	return `${fileIndex}:${braceFrom}`;
}

/** Parse a marker back into a source reference, or null if it is malformed. */
function parseMarker(marker: unknown): SourceRef | null {
	if (typeof marker !== "string") return null;
	const colon = marker.indexOf(":");
	if (colon < 0) return null;
	const fileIndex = Number(marker.slice(0, colon));
	const braceFrom = Number(marker.slice(colon + 1));
	if (!Number.isInteger(fileIndex) || !Number.isInteger(braceFrom))
		return null;
	return { fileIndex, braceFrom };
}

/**
 * Insert a marker field into every instrumentable object literal.
 *
 * Insertion points come from a single parse of the original source and are
 * applied back to front, so each recorded offset still describes the original
 * text. Splicing front to back, or re-parsing between splices, invalidates
 * every offset after the first.
 *
 * No newline is ever inserted, so line numbers survive and only columns shift.
 */
export function instrument(source: string, fileIndex: number = 0): string {
	const tree = parseManifest(source);
	const points: number[] = [];

	for (const body of objectBodies(tree)) {
		// Jsonnet allows a comprehension exactly one dynamic field, so a marker
		// cannot be added to one.
		if (body.isComprehension) continue;
		if (!hasTagKey(body.node, source)) continue;
		points.push(body.braceFrom);
	}

	points.sort((a, b) => b - a);

	let out = source;
	for (const braceFrom of points) {
		const insert = ` "${MARKER}": "${markerFor(fileIndex, braceFrom)}",`;
		out = out.slice(0, braceFrom + 1) + insert + out.slice(braceFrom + 1);
	}
	return out;
}

/** Does this object literal have a statically named field that marks a tag? */
function hasTagKey(node: SyntaxNode, source: string): boolean {
	// Walked directly rather than through `fieldsOf`, because only the presence
	// of a key matters here, not its value node.
	for (let child = node.firstChild; child; child = child.nextSibling) {
		if (child.name !== "Field") continue;
		const nameNode = child.firstChild;
		if (!nameNode) continue;
		const text = source.slice(nameNode.from, nameNode.to);
		if (nameNode.name === "Identifier" && TAG_KEYS.has(text)) return true;
		if (
			nameNode.name === "String" &&
			TAG_KEYS.has(decodeStringLiteral(text))
		) {
			return true;
		}
	}
	return false;
}

/** A deep copy of `value` with every marker field removed. */
export function stripMarkers(value: JsonObject): JsonObject {
	if (Array.isArray(value)) {
		const out: JsonObject[] = [];
		for (const item of value) out.push(stripMarkers(item));
		return out;
	}
	if (value === null || typeof value !== "object") return value;

	const out: Record<string, JsonObject> = {};
	for (const key in value) {
		if (key === MARKER) continue;
		out[key] = stripMarkers((value as Record<string, JsonObject>)[key]);
	}
	return out;
}

/**
 * Walk a manifest value the way validation and SVG generation walk it, so the
 * paths recorded here are the same strings the generator emits.
 *
 * Only `children` is descended, and a lone child object is treated as a
 * one-element array, matching `validateChildren`. Nothing is dropped along the
 * way: validation accumulates errors and throws at the end, so a manifest that
 * would lose a child never reaches this point.
 */
function harvest(
	value: JsonObject,
	path: string,
	sourceOf: Map<string, SourceRef>,
	multiplicity: Map<string, number>,
): void {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return;
	}
	const object = value as Record<string, JsonObject>;

	const ref = parseMarker(object[MARKER]);
	if (ref) {
		sourceOf.set(path, ref);
		const marker = markerFor(ref.fileIndex, ref.braceFrom);
		multiplicity.set(marker, (multiplicity.get(marker) ?? 0) + 1);
	}

	const children = object.children;
	if (children === null || children === undefined) return;

	if (Array.isArray(children)) {
		for (let i = 0; i < children.length; i++) {
			harvest(children[i], childPath(path, i), sourceOf, multiplicity);
		}
	} else {
		harvest(children, childPath(path, 0), sourceOf, multiplicity);
	}
}

/** The path of the `i`th child of `parentPath`. The root's path is `""`. */
export function childPath(parentPath: string, i: number): string {
	return parentPath === "" ? `children[${i}]` : `${parentPath}.children[${i}]`;
}

/**
 * Analyze a Jsonnet manifest.
 *
 * Four gates run before the result is trusted, cheapest first. Each failure
 * still returns the plain evaluation, so the canvas renders and the layers tree
 * fills in; only write-back is lost.
 */
export async function analyzeJsonnet(
	source: string,
	filesystem: InMemoryFileSystem,
	manifestPath: string,
): Promise<ProvenanceResult> {
	const plain = await compileJsonnet(source, filesystem, manifestPath);

	// Gate 1: offsets inside a mis-parsed region are meaningless, and a splice
	// using them lands in unrelated text. This also catches every construct the
	// grammar does not yet cover.
	const errorAt = firstParseError(parseManifest(source));
	if (errorAt !== null) {
		const { line, column } = lineAndColumn(source, errorAt);
		return {
			ok: false,
			value: plain,
			reason: `This manifest uses syntax the editor cannot analyze yet (line ${line}, column ${column}). Edit it as text.`,
		};
	}

	// Gate 2: a source that already contains the marker would evaluate to a
	// duplicate field error, which is a confusing way to learn this.
	if (source.includes(MARKER)) {
		return {
			ok: false,
			value: plain,
			reason: `This manifest contains \`${MARKER}\`, which the editor reserves. Rename it to edit visually.`,
		};
	}

	let instrumented: JsonObject;
	try {
		instrumented = await compileJsonnet(
			instrument(source),
			filesystem,
			manifestPath,
		);
	} catch (error) {
		return {
			ok: false,
			value: plain,
			reason: `The editor could not analyze this manifest: ${String(error)}`,
		};
	}

	// Gate 4: the marker is observable through `std.objectFields`, `std.length`,
	// object equality, and `std.manifestJson`. If any of those saw it, the two
	// evaluations differ and the analysis cannot be trusted.
	const stripped = stripMarkers(instrumented);
	const difference = firstDifference(stripped, plain, "");
	if (difference !== null) {
		return {
			ok: false,
			value: plain,
			reason: `Visual editing is off for this manifest: the object at ${difference} is enumerated or compared somewhere, so the editor cannot track it. Edit it as text.`,
		};
	}

	const sourceOf = new Map<string, SourceRef>();
	const multiplicity = new Map<string, number>();
	harvest(instrumented, "", sourceOf, multiplicity);

	return {
		ok: true,
		value: stripped,
		provenance: { sourceOf, multiplicity, files: [source] },
	};
}

/**
 * The path of the first structural difference between two values, or null.
 *
 * A boolean would be useless in the message the user sees, so this reports
 * where. sjsonnet sorts object keys, so no key normalization is needed.
 */
function firstDifference(
	a: JsonObject,
	b: JsonObject,
	path: string,
): string | null {
	const label = path === "" ? "the root" : path;

	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
			return label;
		}
		for (let i = 0; i < a.length; i++) {
			const found = firstDifference(a[i], b[i], `${path}[${i}]`);
			if (found !== null) return found;
		}
		return null;
	}

	const aIsObject = a !== null && typeof a === "object";
	const bIsObject = b !== null && typeof b === "object";
	if (aIsObject !== bIsObject) return label;

	if (!aIsObject) return a === b ? null : label;

	const ao = a as Record<string, JsonObject>;
	const bo = b as Record<string, JsonObject>;
	for (const key in ao) {
		if (!(key in bo)) return label;
		const found = firstDifference(
			ao[key],
			bo[key],
			path === "" ? key : `${path}.${key}`,
		);
		if (found !== null) return found;
	}
	for (const key in bo) {
		if (!(key in ao)) return label;
	}
	return null;
}

/** One-based line and column of an offset, for an error message. */
function lineAndColumn(
	source: string,
	offset: number,
): { line: number; column: number } {
	let line = 1;
	let lineStart = 0;
	for (let i = 0; i < offset; i++) {
		if (source[i] === "\n") {
			line++;
			lineStart = i + 1;
		}
	}
	return { line, column: offset - lineStart + 1 };
}

/**
 * Analyze a JSON manifest.
 *
 * JSON needs none of the instrumentation above. Evaluation is the identity
 * function, so the syntax tree *is* the value tree and the two can simply be
 * walked in lockstep. No second evaluation, no marker, no gates beyond parsing
 * -- which is why the visual editor writes JSON when it creates a manifest.
 */
export function analyzeJson(source: string): ProvenanceResult {
	const value = JSON.parse(source) as JsonObject;

	const tree = parseManifest(source);
	const errorAt = firstParseError(tree);
	if (errorAt !== null) {
		const { line, column } = lineAndColumn(source, errorAt);
		return {
			ok: false,
			value,
			reason: `This manifest uses syntax the editor cannot analyze yet (line ${line}, column ${column}). Edit it as text.`,
		};
	}

	const root = tree.topNode.firstChild;
	const sourceOf = new Map<string, SourceRef>();
	const multiplicity = new Map<string, number>();
	if (root) walkJsonCst(root, source, "", sourceOf, multiplicity);

	return {
		ok: true,
		value,
		provenance: { sourceOf, multiplicity, files: [source] },
	};
}

/**
 * Record the source position of every tag object, descending through
 * `children` exactly as `harvest` does so both produce the same paths.
 */
function walkJsonCst(
	node: SyntaxNode,
	source: string,
	path: string,
	sourceOf: Map<string, SourceRef>,
	multiplicity: Map<string, number>,
): void {
	if (node.name !== "ObjectExpression") return;
	const brace = node.getChild("{");
	if (!brace) return;

	sourceOf.set(path, { fileIndex: 0, braceFrom: brace.from });
	multiplicity.set(markerFor(0, brace.from), 1);

	const children = findField(
		{ node, braceFrom: brace.from, isComprehension: false },
		source,
		"children",
	);
	if (!children) return;

	if (children.valueNode.name === "ArrayExpression") {
		const elements = arrayElements(children.valueNode);
		for (let i = 0; i < elements.length; i++) {
			walkJsonCst(
				elements[i],
				source,
				childPath(path, i),
				sourceOf,
				multiplicity,
			);
		}
	} else {
		// `validateChildren` wraps a lone child object into a one-element array.
		walkJsonCst(
			children.valueNode,
			source,
			childPath(path, 0),
			sourceOf,
			multiplicity,
		);
	}
}
