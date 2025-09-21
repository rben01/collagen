// jsonnet-parser.ts
// Hand-rolled Jsonnet tokenizer/parser for CodeMirror 6 using @lezer/stream-parser.
// Provides: tokens, keywording, bracket-aware indentation/folding, and language export.
//
// Usage example:
//   import {jsonnetLanguage, jsonnet} from "./jsonnet-parser";
//   new EditorView({
//     doc: "...",
//     extensions: [ jsonnet(), /* or just jsonnetLanguage */ ]
//   });
//
// Notes:
// - This is a stream mode (not a Lezer LR parser). It focuses on *lexing/highlighting*
//   with pragmatic indentation & folding. If you later adopt a full Lezer grammar,
//   you can swap this out for a generated parser with minimal API changes.

import {
	CompletionContext,
	type CompletionResult,
} from "@codemirror/autocomplete";
import {
	LanguageSupport,
	StreamLanguage,
	type StreamParser,
} from "@codemirror/language";

/** ------- Utilities ------- **/

function isIdentStart(ch: string) {
	return /[A-Za-z_]/.test(ch);
}
function isIdent(ch: string) {
	return /[A-Za-z0-9_]/.test(ch);
}
function isDigit(ch: string) {
	return /[0-9]/.test(ch);
}

const keywords = new Set([
	"assert",
	"else",
	"error",
	"false",
	"for",
	"function",
	"if",
	"import",
	"importstr",
	"importbin",
	"in",
	"local",
	"null",
	"then",
	"self",
	"super",
	"true",
]);

// Operators/punctuators we’ll highlight as "operator" or "punctuation"
const twoCharOps = new Set([
	"==",
	"!=",
	"<=",
	">=",
	"&&",
	"||",
	"<<",
	">>",
	"::",
	":::",
]);
const oneCharOps = new Set([
	"+",
	"-",
	"*",
	"/",
	"%",
	"<",
	">",
	"=",
	"!",
	"~",
	"&",
	"^",
	"|",
	":",
	".",
	",",
	";",
]);
const openBrackets = new Set(["(", "[", "{"]);
const closeBrackets = new Set([")", "]", "}"]);

type QuoteKind = '"' | "'" | '@"' | "@'" | "|||";
type Bracket = "(" | "[" | "{"; // stack for indentation/folding

interface State {
	// Multiline comment nesting (Jsonnet comments aren’t specified as nestable; we treat them as non-nesting)
	inBlockComment: boolean;

	// Strings
	inString: QuoteKind | null;
	// For verbatim strings, we close on the first matching quote *unless* doubled
	// For regular strings, support standard JSON escapes plus \uXXXX
	// For text blocks (|||), we track termination heuristic
	textBlockTerminator?: RegExp; // built per block line’s indent context

	// Bracket stack to drive indentation/folding
	brackets: Bracket[];

	// Track if current line started after a trailing operator (hanging indent)
	afterOperator: boolean;
}

function startState(): State {
	return {
		inBlockComment: false,
		inString: null,
		brackets: [],
		afterOperator: false,
	};
}

/** ------- Core tokenizer ------- **/

// Tokenizer contract is "consumes" characters and returns a style string.
// See https://codemirror.net/6/docs/ref/#stream-parser.StreamParser
const jsonnetStream: StreamParser<State> = {
	startState,

	token(stream, state) {
		// Handle currently open constructs first.
		if (state.inBlockComment) {
			if (stream.match("*/")) {
				state.inBlockComment = false;
				return "comment";
			}
			stream.next();
			if (!stream.skipTo("*/")) stream.skipToEnd();
			return "comment";
		}

		if (state.inString) {
			if (state.inString === "|||") {
				// Text block mode: consume until a line that ends (or is) with |||
				// Heuristic: Accept a "|||" preceded only by optional whitespace.
				if (stream.sol()) {
					// At line start, try to match optional space + "|||"
					if (stream.match(/^[ \t]*\|\|\|/, false)) {
						// consume to "|||"
						const idx = stream.string.indexOf("|||", stream.pos);
						if (idx >= 0) {
							stream.pos = idx + 3;
							state.inString = null;
							return "string";
						}
					}
				}
				// Otherwise, eat rest of line as string content
				stream.skipToEnd();
				return "string";
			}

			// Verbatim strings: @"..." or @'...'
			if (state.inString === '@"' || state.inString === "@'") {
				const quote = state.inString === '@"' ? '"' : "'";
				// In verbatim strings, doubled quotes ("") or ('') are escapes; otherwise the first quote ends it.
				while (!stream.eol()) {
					const ch = stream.next()!;
					if (ch === quote) {
						if (stream.peek() === quote) {
							// doubled quote -> consume both, continue
							stream.next();
							continue;
						} else {
							state.inString = null;
							break;
						}
					}
				}
				return "string";
			}

			// Regular quoted strings with escapes
			if (state.inString === '"' || state.inString === "'") {
				const quote = state.inString;
				let esc = false;
				while (!stream.eol()) {
					const ch = stream.next()!;
					if (esc) {
						esc = false; // accept any escape, JSON-like
					} else if (ch === "\\") {
						esc = true;
					} else if (ch === quote) {
						state.inString = null;
						break;
					}
				}
				return "string";
			}
		}

		// Not in a special construct—skip spaces
		if (stream.eatSpace()) return null;

		// Line comments: //...   and  #...
		if (stream.match("//") || stream.match("#")) {
			stream.skipToEnd();
			return "comment";
		}

		// Block comment: /* ... */
		if (stream.match("/*")) {
			state.inBlockComment = true;
			return "comment";
		}

		// Strings: text block '|||' (optional '-' and whitespace allowed immediately after opener)
		if (stream.match("|||")) {
			// After "|||", allow optional "-" and spaces then must end line
			// We’ll treat the remainder of the opener line as string and enter text-block mode.
			// Termination is handled at start of each subsequent line (see above).
			state.inString = "|||";
			// absorb optional - and spaces
			stream.match(/-?[ \t]*/);
			stream.skipToEnd();
			return "string";
		}

		// Verbatim strings: @"...", @'...'
		if (stream.match('@"')) {
			state.inString = '@"';
			return "string";
		}
		if (stream.match("@'")) {
			state.inString = "@'";
			return "string";
		}

		// Regular strings
		if (stream.peek() === '"' || stream.peek() === "'") {
			state.inString = stream.next() as QuoteKind;
			return "string";
		}

		// Numbers: JSON style unsigned; unary +/- handled as separate operator tokens.
		// 0 | [1-9][0-9]* ( '.' [0-9]+ )? ( [eE] [+-]? [0-9]+ )?
		if (isDigit(stream.peek()!)) {
			// 0 or nonzero-leading
			if (
				stream.match(
					/^(?:0(?![0-9])|[1-9][0-9]*(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/,
				)
			) {
				state.afterOperator = false;
				return "number";
			}
		} else if (
			stream.peek() === "." &&
			/\.[0-9]/.test(stream.peek()! + stream.string[stream.pos + 1])
		) {
			// .123 (technically not JSON number, but some editors allow; we’ll avoid to stay strict)
			// We choose to NOT treat this as number to stay close to Jsonnet/JSON.
		}

		// Identifiers & keywords
		if (isIdentStart(stream.peek()!)) {
			let word = stream.next()!;
			while (!stream.eol() && isIdent(stream.peek()!)) word += stream.next();
			if (keywords.has(word)) {
				state.afterOperator = false;
				// "self" and "super" are keywords in Jsonnet; we'll keep them as "keyword"
				if (word === "null" || word === "true" || word === "false")
					return "atom";
				return "keyword";
			}
			state.afterOperator = false;
			return "variableName";
		}

		// Punctuators / operators
		// Try three-char first (only :::)
		if (stream.match(":::")) {
			state.afterOperator = false; // definition-ish operator
			return "operator definition";
		}
		// Two-char operators
		const two = stream.string.slice(stream.pos, stream.pos + 2);
		if (twoCharOps.has(two)) {
			stream.pos += 2;
			// For && || and comparison, treat as operator
			// For :: we already disambiguated :::; :: falls here
			const isLogic = two === "&&" || two === "||";
			state.afterOperator =
				isLogic ||
				two === "==" ||
				two === "!=" ||
				two === "<=" ||
				two === ">=" ||
				two === "<<" ||
				two === ">>";
			return "operator";
		}

		// Brackets and single-char operators/punct
		const ch = stream.next()!;
		if (openBrackets.has(ch)) {
			state.brackets.push(ch as Bracket);
			state.afterOperator = false;
			return "punctuation";
		}
		if (closeBrackets.has(ch)) {
			state.brackets.pop();
			state.afterOperator = false;
			return "punctuation";
		}
		if (oneCharOps.has(ch)) {
			// Track hanging indent when a line ends after operator (handled in indent())
			state.afterOperator =
				ch === "+" ||
				ch === "-" ||
				ch === "*" ||
				ch === "/" ||
				ch === "%" ||
				ch === "<" ||
				ch === ">" ||
				ch === "=" ||
				ch === "!" ||
				ch === "&" ||
				ch === "^" ||
				ch === "|" ||
				ch === ":";
			// Distinguish definition-like operators
			if (ch === ":") return "operator definition";
			if (ch === ".") return "deref operator";
			if (ch === ",") return "separator";
			if (ch === ";") return "separator";
			return "operator";
		}

		// Unknown fallback
		return null;
	},

	// Drive indentation: +1 unit inside unmatched bracket stacks and after "hanging" operators.
	indent(state, textAfter, context) {
		// Base indent: one unit per bracket depth
		const depth = state.brackets.length;

		// If this line starts with a closer, don’t add an extra indent for the matching opener.
		if (/^\s*[)\]}]/.test(textAfter)) {
			return context.unit * Math.max(0, depth - 1);
		}

		// Add one extra unit when previous line ended with an operator (typical hanging indent)
		const extra = state.afterOperator ? 1 : 0;

		return context.unit * (depth + extra);
	},

	// Language data used by CM commands (comment toggling, bracket closing, etc.)
	languageData: {
		commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
		closeBrackets: { brackets: ["(", "[", "{", "'", '"'] },
		wordChars: "_$",
		indentOnInput: /^\s*[}\])]$/,
	},
};

/** Exported language objects **/
import { JSONNET_STDLIB_COMPLETIONS } from "./jsonnet-stdlib-completions";

export const jsonnetLanguage = StreamLanguage.define<State>(jsonnetStream);

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
