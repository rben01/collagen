/**
 * External tokenizer for Jsonnet text blocks (`||| ... |||`).
 *
 * Text blocks cannot be expressed as a Lezer token rule. The content runs until
 * a line whose first non-whitespace characters are `|||`, and a regular token
 * expression cannot say "at the start of a line" — it has no position context.
 *
 * This tokenizer never calls `advance`, so the stream stays parked at the token
 * start and every lookahead offset is absolute. That keeps the bookkeeping to a
 * single index.
 */

import { ExternalTokenizer } from "@lezer/lr";
import { TextBlock } from "./jsonnet-parser.terms.js";

const BAR = 124; // |
const NEWLINE = 10; // \n
const RETURN = 13; // \r
const SPACE = 32;
const TAB = 9;
const EOF = -1;

/** Are the three characters at `at` the text block delimiter? */
function isDelimiter(input, at) {
	return (
		input.peek(at) === BAR &&
		input.peek(at + 1) === BAR &&
		input.peek(at + 2) === BAR
	);
}

/** Advance past spaces and tabs, and return the new offset. */
function skipBlanks(input, at) {
	let i = at;
	while (input.peek(i) === SPACE || input.peek(i) === TAB) i++;
	return i;
}

export const textBlock = new ExternalTokenizer((input, _stack) => {
	if (!isDelimiter(input, 0)) return;

	// Jsonnet requires the opening `|||` to end its line. Without this check a
	// bitwise `a ||| b` would be swallowed as an unterminated text block.
	let i = skipBlanks(input, 3);
	if (input.peek(i) === RETURN) i++;
	if (input.peek(i) !== NEWLINE) return;
	i++;

	for (;;) {
		const afterIndent = skipBlanks(input, i);
		if (isDelimiter(input, afterIndent)) {
			input.acceptToken(TextBlock, afterIndent + 3);
			return;
		}

		let ch = input.peek(i);
		while (ch !== NEWLINE && ch !== EOF) ch = input.peek(++i);

		// Unterminated. Accept nothing so the parser reports an error here
		// rather than treating the rest of the file as string content.
		if (ch === EOF) return;
		i++;
	}
});
