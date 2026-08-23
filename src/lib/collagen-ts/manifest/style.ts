/**
 * Matching a manifest's existing formatting when writing new text into it.
 *
 * Everything the editor writes is a splice into the user's own file, so new
 * text has to look like it was typed by whoever wrote the rest. All of it is
 * read off the syntax tree rather than guessed, because the shipped examples
 * genuinely disagree: `kitty-nesting-smiley` writes `attrs` on one line and
 * quotes keys with `'`, while the `drake-*` examples span several lines and use
 * `"`.
 */

import type { SyntaxNode, Tree } from "@lezer/common";
import { arrayElements, fieldsOf, objectBodies } from "./cst.js";

/** Reserved words that cannot appear as a bare object key. */
const KEYWORDS = new Set([
	"assert",
	"else",
	"error",
	"false",
	"for",
	"function",
	"if",
	"import",
	"importbin",
	"importstr",
	"in",
	"local",
	"null",
	"self",
	"super",
	"tailstrict",
	"then",
	"true",
]);

const BARE_KEY = /^[_a-zA-Z][_a-zA-Z0-9]*$/;

export interface Style {
	/** One level of indentation: a tab, or some number of spaces. */
	indentUnit: string;
	/** Does this file put a comma after the last member of a multi-line literal? */
	trailingComma: boolean;
	/** The quote character used for strings. */
	quote: '"' | "'";
	/** Does this file write object keys as bare identifiers where it can? */
	bareKeys: boolean;
}

const DEFAULT_STYLE: Style = {
	indentUnit: "\t",
	trailingComma: true,
	quote: '"',
	bareKeys: true,
};

/** Infer a file's formatting conventions from what it already contains. */
export function detectStyle(source: string, tree: Tree): Style {
	return {
		indentUnit: detectIndentUnit(source),
		trailingComma: detectTrailingComma(source, tree),
		quote: detectQuote(source, tree),
		bareKeys: detectBareKeys(source, tree),
	};
}

/**
 * The smallest positive indentation in the file.
 *
 * A file that indents by four spaces has lines at 4, 8, and 12, so the minimum
 * is the unit. Tabs win outright if any indented line uses one.
 */
function detectIndentUnit(source: string): string {
	let smallest = 0;
	for (const line of source.split("\n")) {
		if (line.startsWith("\t")) return "\t";
		let spaces = 0;
		while (spaces < line.length && line[spaces] === " ") spaces++;
		// A line that is only whitespace says nothing about indentation.
		if (spaces === 0 || spaces === line.length) continue;
		if (smallest === 0 || spaces < smallest) smallest = spaces;
	}
	return smallest === 0 ? DEFAULT_STYLE.indentUnit : " ".repeat(smallest);
}

/** Does a comma sit between the last member and the closing bracket? */
function hasTrailingComma(node: SyntaxNode): boolean {
	const close = node.lastChild;
	return close?.prevSibling?.name === ",";
}

function detectTrailingComma(source: string, tree: Tree): boolean {
	let withComma = 0;
	let withoutComma = 0;

	for (const body of objectBodies(tree)) {
		// Only multi-line literals say anything: `{ a: 1 }` on one line has no
		// trailing comma regardless of the file's convention.
		if (!source.slice(body.node.from, body.node.to).includes("\n")) continue;
		if (fieldsOf(body, source).length === 0) continue;
		if (hasTrailingComma(body.node)) withComma++;
		else withoutComma++;
	}

	return withComma + withoutComma === 0
		? DEFAULT_STYLE.trailingComma
		: withComma >= withoutComma;
}

function detectQuote(source: string, tree: Tree): '"' | "'" {
	let double = 0;
	let single = 0;
	tree.iterate({
		enter: node => {
			if (node.name !== "String") return;
			const first = source[node.from];
			if (first === '"') double++;
			else if (first === "'") single++;
		},
	});
	return single > double ? "'" : '"';
}

function detectBareKeys(source: string, tree: Tree): boolean {
	let bare = 0;
	let quoted = 0;

	for (const body of objectBodies(tree)) {
		for (const field of fieldsOf(body, source)) {
			if (field.name === null) continue;
			// A key that cannot be written bare says nothing about the choice.
			if (!canBeBare(field.name)) continue;
			if (field.nameNode.name === "Identifier") bare++;
			else quoted++;
		}
	}

	return bare + quoted === 0 ? DEFAULT_STYLE.bareKeys : bare >= quoted;
}

/** Can this key be written without quotes at all? */
function canBeBare(key: string): boolean {
	return BARE_KEY.test(key) && !KEYWORDS.has(key);
}

/** Render an object key, quoting it when it has to be quoted. */
export function printKey(key: string, style: Style): string {
	return style.bareKeys && canBeBare(key) ? key : printString(key, style);
}

/** Render a string literal, escaping what the chosen quote requires. */
export function printString(value: string, style: Style): string {
	let out = style.quote;
	for (const ch of value) {
		if (ch === style.quote || ch === "\\") out += "\\" + ch;
		else if (ch === "\n") out += "\\n";
		else if (ch === "\r") out += "\\r";
		else if (ch === "\t") out += "\\t";
		else out += ch;
	}
	return out + style.quote;
}

/**
 * Render a number.
 *
 * Jsonnet numbers follow JSON, so a leading digit is required: `.5` is a parse
 * error in sjsonnet as much as in the grammar. Coordinates arrive from pointer
 * math as long binary fractions, so they are rounded before printing.
 */
export function printNumber(value: number, decimals: number = 3): string {
	if (!Number.isFinite(value)) {
		throw new RangeError(`Cannot write ${value} to a manifest`);
	}
	if (Number.isInteger(value)) return String(value);

	const rounded = Number(value.toFixed(decimals));
	// `toFixed` keeps trailing zeros and `Number` drops them, but a value like
	// 1e-7 rounds to 0 and a huge one goes exponential, which is valid Jsonnet.
	return String(rounded);
}

/** Render a manifest value. */
export function printValue(value: string | number, style: Style): string {
	return typeof value === "number"
		? printNumber(value)
		: printString(value, style);
}

/** The leading whitespace of the line containing `offset`. */
export function indentAt(source: string, offset: number): string {
	const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
	let end = lineStart;
	while (
		end < source.length &&
		(source[end] === " " || source[end] === "\t")
	) {
		end++;
	}
	return source.slice(lineStart, end);
}

/** Does this literal span more than one line? */
export function isMultiline(source: string, node: SyntaxNode): boolean {
	return source.slice(node.from, node.to).includes("\n");
}

/** The number of elements an array literal holds. */
export function elementCount(node: SyntaxNode): number {
	return arrayElements(node).length;
}
