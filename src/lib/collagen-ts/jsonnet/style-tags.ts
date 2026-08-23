/**
 * Jsonnet syntax highlighting tags.
 *
 * Kept separate from `cm-jsonnet-highlight.ts` so the static highlighter used by
 * the docs page can share this mapping without pulling CodeMirror into that
 * route's bundle.
 */

import { styleTags, tags as t } from "@lezer/highlight";

export const jsonnetStyleTags = styleTags({
	LineComment: t.lineComment,
	VariableName: t.variableName,
	Boolean: t.bool,
	String: t.string,
	Keyword: t.keyword,
	"( )": t.paren,
	"[ ]": t.bracket,
	"{ }": t.brace,
	"assert else error false for function if import importstr importbin in local tailstrict then super true":
		t.controlKeyword,
	self: t.self,
	Number: t.number,
	null: t.null,
	"CallExpression/VariableName": t.function(t.variableName),
	"attrs children tag": t.attributeName,
});
