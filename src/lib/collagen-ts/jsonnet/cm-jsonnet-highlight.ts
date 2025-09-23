import {
	CompletionContext,
	type CompletionResult,
} from "@codemirror/autocomplete";
import {
	foldInside,
	foldNodeProp,
	indentNodeProp,
	LanguageSupport,
	LRLanguage,
} from "@codemirror/language";
import { styleTags, tags as t } from "@lezer/highlight";
import { parser as unconfiguredParser } from "./jsonnet-parser";
import { JSONNET_STDLIB_COMPLETIONS } from "./jsonnet-stdlib-completions";

const parser = unconfiguredParser.configure({
	props: [
		styleTags({
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
		}),
		indentNodeProp.add({
			Application: context =>
				context.column(context.node.from) + context.unit,
		}),
		foldNodeProp.add({ Application: foldInside }),
	],
});

const jsonnetLanguage = LRLanguage.define({
	parser,
	languageData: {
		commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
		closeBrackets: { brackets: ["(", "[", "{", "'", '"'] },
		wordChars: "_$",
		indentOnInput: /^\s*[}\])]$/,
	},
});

// export const jsonnetLanguage = StreamLanguage.define<State>(jsonnetStream);

function autocomplete(context: CompletionContext): CompletionResult | null {
	const word = context.matchBefore(/std.\w*\(?/);
	console.log({ word, ...context });
	if (word && word.from !== word.to) {
		return {
			from: word.from + 4, // skip "std."
			options: JSONNET_STDLIB_COMPLETIONS,
			validFor: /\w*/,
		};
	}

	return null;

	// word = context.matchBefore(/\w*/);
	// if (!word || (word.from == word.to && !context.explicit)) return null;
	// console.log({ word });
	// return {
	// 	from: word.from,
	// 	options: [
	// 		{ label: "local", type: "keyword", detail: "Define a variable" },
	// 		{
	// 			label: "attrs",
	// 			type: "property",
	// 			detail: "The element's attributes",
	// 		},
	// 		{
	// 			label: "children",
	// 			type: "property",
	// 			detail: "The element's children",
	// 		},
	// 	],
	// };
}

export function jsonnet(): LanguageSupport {
	return new LanguageSupport(jsonnetLanguage, [
		jsonnetLanguage.data.of({ autocomplete }),
	]);
}
