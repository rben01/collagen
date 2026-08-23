/**
 * Concrete syntax tree helpers over the Lezer Jsonnet parser.
 *
 * The GUI editor never re-serializes a manifest. It splices the original text
 * at node offsets, because a Lezer tree is read-only and holds no whitespace,
 * so pretty-printing one back out would destroy comments, formatting, and every
 * `local` in the file. Everything here exists to find those offsets.
 *
 * The grammar inlines its lowercase rules, so `forSpec`, `objBody`, and
 * `fieldName` are not node types. An `ArrayComprehension`'s children are the
 * flat sequence `[`, body, `for`, name, `in`, iterable, `]`, and a `Field`'s
 * value is simply its last child.
 */

import type { SyntaxNode, Tree } from "@lezer/common";
import { parser } from "../jsonnet/jsonnet-parser.js";

/** Parse manifest source. Works for JSON too, which Jsonnet is a superset of. */
export function parseManifest(source: string): Tree {
	return parser.parse(source);
}

/**
 * Offset of the first error node, or null if the source parses cleanly.
 *
 * Instrumentation must never run on a tree with errors: offsets inside a
 * mis-parsed region are meaningless, and a splice using them lands in the
 * middle of unrelated text.
 */
export function firstParseError(tree: Tree): number | null {
	let offset: number | null = null;
	tree.iterate({
		enter: node => {
			if (offset !== null) return false;
			if (node.type.isError) {
				offset = node.from;
				return false;
			}
			return true;
		},
	});
	return offset;
}

/** An object literal body, whether written plainly or as an `a { ... }` merge. */
export interface ObjectBody {
	/** The `ObjectExpression` or `ObjectMerge` node. */
	node: SyntaxNode;
	/** Offset of the `{` that opens this body. */
	braceFrom: number;
	/**
	 * True for an object comprehension, `{ [k]: v for x in xs }`.
	 *
	 * Jsonnet allows a comprehension exactly one dynamic field, so a marker
	 * field cannot be added to one.
	 */
	isComprehension: boolean;
}

function toObjectBody(node: SyntaxNode): ObjectBody | null {
	const brace = node.getChild("{");
	if (!brace) return null;
	return {
		node,
		braceFrom: brace.from,
		isComprehension: node.getChild("for") !== null,
	};
}

/**
 * Every object literal in the tree, outermost first.
 *
 * `ObjectMerge` matters as much as `ObjectExpression`. The grammar spells a
 * merge as `expression "{" objBody? "}"` with bare brace tokens and no inner
 * `ObjectExpression`, so a walk that looks only for `ObjectExpression` skips
 * every `base { ... }` override in the file.
 */
export function objectBodies(tree: Tree): ObjectBody[] {
	const bodies: ObjectBody[] = [];
	tree.iterate({
		enter: node => {
			if (node.name !== "ObjectExpression" && node.name !== "ObjectMerge") {
				return;
			}
			const body = toObjectBody(node.node);
			if (body) bodies.push(body);
		},
	});
	return bodies;
}

/** The object literal whose `{` sits at `braceFrom`, or null. */
export function objectBodyAtBrace(
	tree: Tree,
	braceFrom: number,
): ObjectBody | null {
	const brace = tree.resolveInner(braceFrom, 1);
	if (brace.name !== "{") return null;
	const parent = brace.parent;
	if (!parent) return null;
	if (parent.name !== "ObjectExpression" && parent.name !== "ObjectMerge") {
		return null;
	}
	return toObjectBody(parent);
}

/** One `key: value` member of an object literal. */
export interface FieldInfo {
	node: SyntaxNode;
	/** The decoded key, or null when it is computed (`[expr]: value`). */
	name: string | null;
	/** The key node: an `Identifier`, a `String`, or the `[` of a computed key. */
	nameNode: SyntaxNode;
	valueNode: SyntaxNode;
}

/** The fields of an object literal, in source order. Locals and asserts are skipped. */
export function fieldsOf(body: ObjectBody, source: string): FieldInfo[] {
	const fields: FieldInfo[] = [];
	for (let child = body.node.firstChild; child; child = child.nextSibling) {
		if (child.name !== "Field") continue;
		const nameNode = child.firstChild;
		const valueNode = child.lastChild;
		if (!nameNode || !valueNode || nameNode === valueNode) continue;
		fields.push({
			node: child,
			name: staticFieldName(nameNode, source),
			nameNode,
			valueNode,
		});
	}
	return fields;
}

/** The named field of an object literal, or null. */
export function findField(
	body: ObjectBody,
	source: string,
	name: string,
): FieldInfo | null {
	for (const field of fieldsOf(body, source)) {
		if (field.name === name) return field;
	}
	return null;
}

/** The key a field names, or null when the key is computed. */
function staticFieldName(nameNode: SyntaxNode, source: string): string | null {
	const text = source.slice(nameNode.from, nameNode.to);
	if (nameNode.name === "Identifier") return text;
	if (nameNode.name === "String") return decodeStringLiteral(text);
	return null;
}

const SHORT_ESCAPES: Record<string, string> = {
	b: "\b",
	f: "\f",
	n: "\n",
	r: "\r",
	t: "\t",
};

/**
 * Decode a Jsonnet string literal, quotes included.
 *
 * Verbatim strings (`@"..."`) escape only the quote character, by doubling it.
 */
export function decodeStringLiteral(text: string): string {
	if (text.startsWith("@")) {
		const quote = text[1];
		return text
			.slice(2, -1)
			.split(quote + quote)
			.join(quote);
	}

	const body = text.slice(1, -1);
	let out = "";
	for (let i = 0; i < body.length; i++) {
		if (body[i] !== "\\") {
			out += body[i];
			continue;
		}
		const next = body[++i];
		if (next === "u") {
			out += String.fromCharCode(parseInt(body.slice(i + 1, i + 5), 16));
			i += 4;
		} else {
			out += SHORT_ESCAPES[next] ?? next;
		}
	}
	return out;
}

/** Direct element expressions of an `ArrayExpression`, in source order. */
export function arrayElements(node: SyntaxNode): SyntaxNode[] {
	const elements: SyntaxNode[] = [];
	for (let child = node.firstChild; child; child = child.nextSibling) {
		if (child.type.is("Expression")) elements.push(child);
	}
	return elements;
}

/** The template expression of an `ArrayComprehension` — its first element. */
export function comprehensionBody(node: SyntaxNode): SyntaxNode | null {
	for (let child = node.firstChild; child; child = child.nextSibling) {
		if (child.type.is("Expression")) return child;
		if (child.name === "for") return null;
	}
	return null;
}

/** The nearest `ArrayComprehension` at or above `node`, or null. */
export function enclosingComprehension(node: SyntaxNode): SyntaxNode | null {
	for (let n: SyntaxNode | null = node; n; n = n.parent) {
		if (n.name === "ArrayComprehension") return n;
	}
	return null;
}
