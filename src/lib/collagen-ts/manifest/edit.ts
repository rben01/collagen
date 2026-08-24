/**
 * Writing GUI edits back into the manifest source.
 *
 * Every operation here is a text splice on the original file, never a
 * re-serialization of the evaluated manifest. A Lezer tree is read-only and
 * holds no whitespace, so printing one back out would throw away comments,
 * formatting, and every `local` and import in the file -- which is to say, the
 * whole reason someone wrote Jsonnet instead of JSON.
 *
 * These functions are mechanical. Deciding whether an edit should happen at all
 * -- whether the user meant to change one element or all four a loop produced
 * -- belongs to the editor, which knows about grouping. What lives here is
 * "given a target and a value, what text change expresses it".
 */

import type { SyntaxNode, Tree } from "@lezer/common";
import {
	arrayElements,
	asObjectBody,
	enclosingComprehension,
	fieldsOf,
	findField,
	objectBodyAtBrace,
	parseManifest,
	type ObjectBody,
} from "./cst.js";
import {
	detectStyle,
	indentAt,
	isMultiline,
	printJsonnet,
	printKey,
	printValue,
	type Style,
} from "./style.js";

/** Why an edit could not be expressed as a splice. */
export type BlockReason =
	/** Nothing is at the offset the editor asked about. */
	| "not-found"
	/** The value is an expression, so overwriting it would destroy a computation. */
	| "computed"
	/** The object builds its keys dynamically, so inserting one risks a duplicate. */
	| "dynamic-key";

export type EditOutcome =
	| { ok: true; source: string }
	| { ok: false; blockedBy: BlockReason; reason: string };

function blocked(blockedBy: BlockReason, reason: string): EditOutcome {
	return { ok: false, blockedBy, reason };
}

/** Node types whose entire text can be replaced with a new literal. */
function literalRange(node: SyntaxNode): { from: number; to: number } | null {
	if (
		node.name === "Number" ||
		node.name === "String" ||
		node.name === "Boolean" ||
		node.name === "Null"
	) {
		return { from: node.from, to: node.to };
	}

	// A negative number is a UnaryExpression wrapping a Number, not a Number,
	// so the whole node has to go.
	if (node.name === "UnaryExpression") {
		const operand = node.lastChild;
		if (operand?.name === "Number") return { from: node.from, to: node.to };
	}

	return null;
}

/** Everything an edit needs about its target. */
interface Target {
	tree: Tree;
	body: ObjectBody;
	style: Style;
}

function resolveTarget(source: string, braceFrom: number): Target | null {
	const tree = parseManifest(source);
	const body = objectBodyAtBrace(tree, braceFrom);
	if (!body) return null;
	return { tree, body, style: detectStyle(source, tree) };
}

/**
 * Splice a new member into an object literal, matching how the file is written.
 *
 * Insertion goes after the last existing member rather than before the closing
 * brace, so it lands inside any trailing comment rather than after it.
 */
function insertMember(
	source: string,
	body: ObjectBody,
	memberText: string,
	style: Style,
): string {
	let lastMember: SyntaxNode | null = null;
	let comma: SyntaxNode | null = null;

	for (let child = body.node.firstChild; child; child = child.nextSibling) {
		if (child.name === "Field" || child.name === "ObjectLocal") {
			lastMember = child;
			comma = null;
		} else if (child.name === "," && lastMember) {
			comma = child;
		}
	}

	// An empty object has nowhere to anchor, so write the one member inline.
	if (!lastMember) {
		const brace = body.braceFrom;
		return `${source.slice(0, brace + 1)} ${memberText} ${source.slice(body.node.to - 1)}`;
	}

	const insertAt = comma ? comma.to : lastMember.to;
	const separator = comma ? "" : ",";

	if (!isMultiline(source, body.node)) {
		return splice(source, insertAt, insertAt, `${separator} ${memberText}`);
	}

	const indent = indentAt(source, lastMember.from);
	const trailing = style.trailingComma ? "," : "";
	return splice(
		source,
		insertAt,
		insertAt,
		`${separator}\n${indent}${memberText}${trailing}`,
	);
}

/** Replace `[from, to)` of `source` with `text`. */
function splice(
	source: string,
	from: number,
	to: number,
	text: string,
): string {
	return source.slice(0, from) + text + source.slice(to);
}

/** Does this object build any of its keys at evaluation time? */
function hasDynamicKey(body: ObjectBody, source: string): boolean {
	for (const field of fieldsOf(body, source)) {
		if (field.name === null) return true;
	}
	return false;
}

/**
 * Set one attribute of the tag whose object literal opens at `braceFrom`.
 *
 * This is the workhorse: moving, resizing, recoloring, and retyping all reduce
 * to it.
 */
export function setAttribute(
	source: string,
	braceFrom: number,
	key: string,
	value: string | number,
): EditOutcome {
	const target = resolveTarget(source, braceFrom);
	if (!target) return blocked("not-found", "That element is no longer here.");

	const { body, style } = target;
	const attrsField = findField(body, source, "attrs");

	if (!attrsField) {
		const member = `${printKey("attrs", style)}: { ${printKey(key, style)}: ${printValue(value, style)} }`;
		if (hasDynamicKey(body, source)) {
			return blocked(
				"dynamic-key",
				"This element builds its keys as it runs, so adding `attrs` here could collide with one.",
			);
		}
		return { ok: true, source: insertMember(source, body, member, style) };
	}

	const attrsBody = asObjectBody(attrsField.valueNode);
	if (!attrsBody) {
		return blocked(
			"computed",
			`\`attrs\` is computed here (\`${source.slice(attrsField.valueNode.from, attrsField.valueNode.to)}\`), so the editor cannot change one of its entries.`,
		);
	}

	const existing = findField(attrsBody, source, key);
	if (!existing) {
		if (hasDynamicKey(attrsBody, source)) {
			return blocked(
				"dynamic-key",
				`\`attrs\` builds its keys as it runs, so adding \`${key}\` could collide with one.`,
			);
		}
		const member = `${printKey(key, style)}: ${printValue(value, style)}`;
		return {
			ok: true,
			source: insertMember(source, attrsBody, member, style),
		};
	}

	const range = literalRange(existing.valueNode);
	if (!range) {
		const text = source.slice(existing.valueNode.from, existing.valueNode.to);
		return blocked(
			"computed",
			`\`${key}\` is computed here (\`${text}\`). Changing it would replace the expression with a fixed value.`,
		);
	}

	return {
		ok: true,
		source: splice(source, range.from, range.to, printValue(value, style)),
	};
}

/** Remove one attribute, along with the comma that separated it. */
export function removeAttribute(
	source: string,
	braceFrom: number,
	key: string,
): EditOutcome {
	const target = resolveTarget(source, braceFrom);
	if (!target) return blocked("not-found", "That element is no longer here.");

	const attrsField = findField(target.body, source, "attrs");
	const attrsBody = attrsField && asObjectBody(attrsField.valueNode);
	if (!attrsBody) {
		return blocked(
			"computed",
			"This element has no plain `attrs` to change.",
		);
	}

	const existing = findField(attrsBody, source, key);
	if (!existing) return { ok: true, source };

	const { from, to } = memberExtent(source, attrsBody.node, existing.node);
	return { ok: true, source: splice(source, from, to, "") };
}

/**
 * The text a member occupies, including its separating comma and its own line.
 *
 * Comments are nodes in this grammar, so a comment sitting on its own line
 * above a member travels with it, and a comment trailing on the same line
 * after the comma does too. Anything else stays where the author put it.
 */
function memberExtent(
	source: string,
	container: SyntaxNode,
	member: SyntaxNode,
): { from: number; to: number } {
	let from = member.from;
	let to = member.to;

	// Leading comments that sit on their own lines belong to this member.
	for (
		let prev = member.prevSibling;
		prev && (prev.name === "LineComment" || prev.name === "BlockComment");
		prev = prev.prevSibling
	) {
		if (!source.slice(prev.to, from).includes("\n")) break;
		from = prev.from;
	}

	// The comma that separates this member from the next.
	let tookTrailingComma = false;
	let next = member.nextSibling;
	if (next?.name === ",") {
		to = next.to;
		tookTrailingComma = true;
		next = next.nextSibling;
		// A comment still on the comma's line trails this member.
		if (
			next &&
			(next.name === "LineComment" || next.name === "BlockComment") &&
			!source.slice(to, next.from).includes("\n")
		) {
			to = next.to;
		}
	} else {
		// The last member instead absorbs the comma that preceded it.
		const prev = member.prevSibling;
		if (prev?.name === ",") from = prev.from;
	}

	const lineStart = source.lastIndexOf("\n", from - 1) + 1;
	const lineEnd = source.indexOf("\n", to);
	const ownsItsLine =
		lineStart > container.from &&
		source.slice(lineStart, from).trim() === "" &&
		lineEnd !== -1 &&
		source.slice(to, lineEnd).trim() === "";

	if (ownsItsLine) {
		// Take the whole line, newline included, or an empty one is left behind.
		return { from: lineStart, to: lineEnd + 1 };
	}

	// On a shared line, the space that followed the comma would otherwise be
	// left to collide with the next member.
	if (tookTrailingComma) {
		while (
			to < source.length &&
			(source[to] === " " || source[to] === "\t")
		) {
			to++;
		}
	}

	return { from, to };
}

/** The `children` array of a tag, when it is written as a plain array. */
function childrenArray(source: string, body: ObjectBody): SyntaxNode | null {
	const field = findField(body, source, "children");
	if (!field) return null;
	return field.valueNode.name === "ArrayExpression" ? field.valueNode : null;
}

/**
 * Insert a child element into a tag, at `index`.
 *
 * `elementText` is written by the caller, which knows what tag it is building.
 */
export function insertChild(
	source: string,
	parentBraceFrom: number,
	index: number,
	elementText: string,
): EditOutcome {
	const target = resolveTarget(source, parentBraceFrom);
	if (!target) return blocked("not-found", "That element is no longer here.");

	const { body, style } = target;
	const field = findField(body, source, "children");

	// No `children` at all: write the whole field.
	if (!field) {
		if (hasDynamicKey(body, source)) {
			return blocked(
				"dynamic-key",
				"This element builds its keys as it runs, so adding `children` could collide with one.",
			);
		}
		const member = `${printKey("children", style)}: [${elementText}]`;
		return { ok: true, source: insertMember(source, body, member, style) };
	}

	// A lone child object: wrap it in an array first, matching how validation
	// already treats it.
	if (field.valueNode.name !== "ArrayExpression") {
		if (field.valueNode.name === "ArrayComprehension") {
			return blocked(
				"computed",
				"These children come from a loop. Detach it first to add one alongside them.",
			);
		}
		if (!asObjectBody(field.valueNode)) {
			return blocked(
				"computed",
				`\`children\` is computed here (\`${source.slice(field.valueNode.from, field.valueNode.to)}\`).`,
			);
		}
		const existing = source.slice(field.valueNode.from, field.valueNode.to);
		const parts =
			index <= 0 ? [elementText, existing] : [existing, elementText];
		return {
			ok: true,
			source: splice(
				source,
				field.valueNode.from,
				field.valueNode.to,
				`[${parts.join(", ")}]`,
			),
		};
	}

	return insertElement(source, field.valueNode, index, elementText, style);
}

/** Splice a new element into an array literal at `index`. */
function insertElement(
	source: string,
	array: SyntaxNode,
	index: number,
	elementText: string,
	style: Style,
): EditOutcome {
	const elements = arrayElements(array);

	if (elements.length === 0) {
		const open = array.firstChild;
		if (!open) return blocked("not-found", "That list is no longer here.");
		return {
			ok: true,
			source: splice(source, open.to, array.to - 1, elementText),
		};
	}

	const multiline = isMultiline(source, array);
	const clamped = Math.max(0, Math.min(index, elements.length));

	if (clamped === elements.length) {
		const last = elements[elements.length - 1];
		let comma: SyntaxNode | null = null;
		for (let n = last.nextSibling; n; n = n.nextSibling) {
			if (n.name === ",") {
				comma = n;
				break;
			}
			if (n.name === "]") break;
		}
		const insertAt = comma ? comma.to : last.to;
		const separator = comma ? "" : ",";
		const text = multiline
			? `${separator}\n${indentAt(source, last.from)}${elementText}${style.trailingComma ? "," : ""}`
			: `${separator} ${elementText}`;
		return { ok: true, source: splice(source, insertAt, insertAt, text) };
	}

	const before = elements[clamped];
	if (!multiline) {
		return {
			ok: true,
			source: splice(source, before.from, before.from, `${elementText}, `),
		};
	}

	const indent = indentAt(source, before.from);
	const at = source.lastIndexOf("\n", before.from - 1) + 1;
	return {
		ok: true,
		source: splice(source, at, at, `${indent}${elementText},\n`),
	};
}

/** Remove the child at `index`. */
export function removeChild(
	source: string,
	parentBraceFrom: number,
	index: number,
): EditOutcome {
	const target = resolveTarget(source, parentBraceFrom);
	if (!target) return blocked("not-found", "That element is no longer here.");

	const array = childrenArray(source, target.body);
	if (!array) {
		return blocked(
			"computed",
			"These children are not a plain list, so the editor cannot remove one.",
		);
	}

	const elements = arrayElements(array);
	if (index < 0 || index >= elements.length) {
		return blocked("not-found", "That element is no longer here.");
	}

	const { from, to } = memberExtent(source, array, elements[index]);
	return { ok: true, source: splice(source, from, to, "") };
}

/**
 * Move the child at `fromIndex` to `toIndex`, for reordering layers.
 *
 * The array is rebuilt from its elements rather than spliced twice. Working out
 * commas during a splice means handling the first element, the last element,
 * and the file's trailing-comma style all at once; rebuilding gets all three
 * right by construction. Each element keeps its own text verbatim, comments
 * included, and every element of an array sits at one indent level, so
 * reindenting is just reusing that level.
 */
export function moveChild(
	source: string,
	parentBraceFrom: number,
	fromIndex: number,
	toIndex: number,
): EditOutcome {
	const target = resolveTarget(source, parentBraceFrom);
	if (!target) return blocked("not-found", "That element is no longer here.");

	const array = childrenArray(source, target.body);
	if (!array) {
		return blocked(
			"computed",
			"These children are not a plain list, so the editor cannot reorder them.",
		);
	}

	const chunks = elementChunks(source, array);
	if (
		fromIndex < 0 ||
		fromIndex >= chunks.length ||
		toIndex < 0 ||
		toIndex >= chunks.length
	) {
		return blocked("not-found", "That element is no longer here.");
	}
	if (fromIndex === toIndex) return { ok: true, source };

	const reordered = chunks.slice();
	const [moved] = reordered.splice(fromIndex, 1);
	reordered.splice(toIndex, 0, moved);

	return {
		ok: true,
		source: splice(
			source,
			array.from,
			array.to,
			printArray(source, array, reordered, target.style),
		),
	};
}

/**
 * The text of each array element, with any comments that lead it, and without
 * the commas that separate them.
 */
function elementChunks(source: string, array: SyntaxNode): string[] {
	const elements = arrayElements(array);
	const chunks: string[] = [];
	// The first chunk starts just inside the bracket; later ones start after
	// the comma that ended the previous element.
	let start = (array.firstChild?.to ?? array.from) + 0;

	for (const element of elements) {
		chunks.push(source.slice(start, element.to).trim());
		let next = element.nextSibling;
		while (next && next.name !== ",") {
			if (next.name === "]") break;
			next = next.nextSibling;
		}
		start = next && next.name === "," ? next.to : element.to;
	}

	return chunks;
}

/** Rewrite an array literal from element texts, in this file's style. */
function printArray(
	source: string,
	array: SyntaxNode,
	chunks: string[],
	style: Style,
): string {
	if (chunks.length === 0) return "[]";
	if (!isMultiline(source, array)) return `[${chunks.join(", ")}]`;

	const elements = arrayElements(array);
	const indent = indentAt(source, elements[0].from);
	const closeIndent = indentAt(source, array.to - 1);
	const trailing = style.trailingComma ? "," : "";
	const body = chunks.map(chunk => indent + chunk).join(",\n");
	return `[\n${body}${trailing}\n${closeIndent}]`;
}

/**
 * Replace the loop that produced an element with the elements it produced.
 *
 * This is the escape hatch behind "detach". Editing a loop body changes every
 * element it makes, which is usually what someone wants -- they are editing the
 * template. When they want one element to differ, the honest move is to stop
 * having a loop, so the elements become ordinary literals that every other
 * operation here already handles.
 *
 * It is lossy and one way: locals, imports, and computed values all bake down
 * to fixed text. `values` must come from the plain evaluation, or markers get
 * baked in with everything else.
 */
export function detachComprehension(
	source: string,
	braceFrom: number,
	values: unknown[],
): EditOutcome {
	const tree = parseManifest(source);
	const body = objectBodyAtBrace(tree, braceFrom);
	if (!body) return blocked("not-found", "That element is no longer here.");

	const comprehension = enclosingComprehension(body.node);
	if (!comprehension) {
		return blocked(
			"computed",
			"These elements do not come from a loop, so there is no loop to expand. They are built by shared code instead.",
		);
	}

	const style = detectStyle(source, tree);
	const indent = indentAt(source, comprehension.from);
	return {
		ok: true,
		source: splice(
			source,
			comprehension.from,
			comprehension.to,
			printJsonnet(values, style, indent),
		),
	};
}

/**
 * Render a new element for one of the drawing tools.
 *
 * `primaryKey` is the field that decides what kind of tag this is: `tag` for a
 * shape, `image_path` for a placed image. Validation dispatches on it, so it
 * has to come first and there has to be exactly one.
 */
export function printElement(
	source: string,
	primaryKey: string,
	primaryValue: string,
	attrs: Record<string, string | number>,
	text?: string,
): string {
	const style = detectStyle(source, parseManifest(source));
	const value: Record<string, unknown> = { [primaryKey]: primaryValue, attrs };
	if (text !== undefined) value.children = text;

	// New elements are written on one line: they are small, and a fresh shape
	// reads better beside its siblings than spread over six lines.
	const parts: string[] = [];
	for (const key in value) {
		const item = value[key];
		parts.push(
			`${printKey(key, style)}: ${
				key === "attrs"
					? printInlineObject(attrs, style)
					: printJsonnet(item, style)
			}`,
		);
	}
	return `{ ${parts.join(", ")} }`;
}

function printInlineObject(
	attrs: Record<string, string | number>,
	style: Style,
): string {
	const parts: string[] = [];
	for (const key in attrs) {
		parts.push(`${printKey(key, style)}: ${printValue(attrs[key], style)}`);
	}
	return parts.length === 0 ? "{}" : `{ ${parts.join(", ")} }`;
}
