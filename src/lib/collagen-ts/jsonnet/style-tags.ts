/**
 * Jsonnet syntax highlighting tags.
 *
 * Kept separate from `cm-jsonnet-highlight.ts` so the static highlighter used by
 * the docs page can share this mapping without pulling CodeMirror into that
 * route's bundle.
 */

import { styleTags, tags as t } from "@lezer/highlight";

// Every key here must name a node the grammar actually produces, or it is a
// silent no-op. This grammar has no `VariableName` or `Keyword` node — plain
// names are `Identifier`, and keywords are @specialize'd into their own node
// types — and it has no content-aware nodes for manifest keys such as `attrs`.
export const jsonnetStyleTags = styleTags({
	LineComment: t.lineComment,
	BlockComment: t.blockComment,
	Boolean: t.bool,
	String: t.string,
	TextBlock: t.string,
	"( )": t.paren,
	"[ ]": t.bracket,
	"{ }": t.brace,
	"assert else error false for function if import importstr importbin in local tailstrict then super true":
		t.controlKeyword,
	self: t.self,
	Number: t.number,
	null: t.null,
});
