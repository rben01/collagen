/**
 * Static Jsonnet syntax highlighting.
 *
 * Produces plain tokens from a code string using the same Lezer grammar and tag
 * mapping the in-app editor uses. Deliberately avoids CodeMirror: this runs
 * during prerendering, and a docs page has no reason to ship an editor runtime.
 */

import { classHighlighter, highlightTree } from "@lezer/highlight";
import { parser as unconfiguredParser } from "./jsonnet-parser";
import { jsonnetStyleTags } from "./style-tags";

const parser = unconfiguredParser.configure({ props: [jsonnetStyleTags] });

/** A run of source text sharing one highlight class. */
export interface Token {
	text: string;
	/** Highlight class (e.g. `tok-string`), or null for unstyled text. */
	className: string | null;
}

/**
 * Tokenize Jsonnet source for display.
 *
 * Returns the whole input in order, styled and unstyled runs alike, so joining
 * every `text` reproduces the input exactly.
 */
export function highlightJsonnet(code: string): Token[] {
	const tree = parser.parse(code);
	const tokens: Token[] = [];
	let pos = 0;

	highlightTree(tree, classHighlighter, (from, to, classes) => {
		if (from > pos) {
			tokens.push({ text: code.slice(pos, from), className: null });
		}
		tokens.push({ text: code.slice(from, to), className: classes });
		pos = to;
	});

	if (pos < code.length) {
		tokens.push({ text: code.slice(pos), className: null });
	}

	return tokens;
}
