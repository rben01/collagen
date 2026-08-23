/**
 * Grammar conformance for the Lezer Jsonnet parser.
 *
 * The rule these tests enforce is agreement with sjsonnet, in one direction:
 * the grammar may accept more than sjsonnet does, but never less. A construct
 * the evaluator runs and the parser rejects is the dangerous case, because
 * every tool built on the parse tree then silently skips real code. That is
 * exactly what the missing `/` operator was.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parser } from "../jsonnet/jsonnet-parser.js";
import { SjsonnetMain } from "../jsonnet/sjsonnet.js";

/** Count error nodes in a parse of `code`. */
function parseErrors(code: string): number {
	let count = 0;
	parser.parse(code).iterate({
		enter: node => {
			if (node.type.isError) count++;
		},
	});
	return count;
}

function parses(code: string): boolean {
	return parseErrors(code) === 0;
}

function evaluates(code: string): boolean {
	try {
		SjsonnetMain.interpret(
			code,
			{},
			{},
			"",
			(_wd, imported) => imported,
			() => "{}",
		);
		return true;
	} catch {
		return false;
	}
}

/** Every `.jsonnet` and `.libjsonnet` file under `dir`, recursively. */
function jsonnetFilesUnder(dir: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) {
			found.push(...jsonnetFilesUnder(path));
		} else if (/\.(jsonnet|libjsonnet|libsonnet)$/.test(entry)) {
			found.push(path);
		}
	}
	return found;
}

describe("Jsonnet grammar", () => {
	describe("constructs the grammar used to reject", () => {
		const cases: [string, string][] = [
			["division", "{ x: 10 / 4 }"],
			["division beside a line comment", "{ x: 10 / 4, // half\n y: 1 }"],
			["division beside a block comment", "{ x: 10 /* half */ / 4 }"],
			["object comprehension", "{ [k]: 1 for k in ['a', 'b'] }"],
			[
				"object comprehension with a local",
				"{ local n = 2, [k]: n for k in ['a'] }",
			],
			["unicode escape with hex letters", '{ x: "caf\\u00e9" }'],
			["text block", "{ x: |||\n  hi\n||| }"],
			["indented text block", "{\n  x: |||\n    a\n    b\n  |||,\n}"],
			["text block containing a blank line", "{ x: |||\n  a\n\n  b\n||| }"],
			// `[::2]` tokenizes as `[` `::` `2` `]`, because longest-match makes
			// `::` win over two `:` tokens.
			["slice with a step and no bounds", "{ x: [1, 2, 3][::2] }"],
			["slice with a step and a start", "{ x: [1, 2, 3][1::2] }"],
			["assert with a message", "{ x: assert true : 'no'; 1 }"],
		];

		it.each(cases)("parses %s", (_name, code) => {
			expect(parseErrors(code)).toBe(0);
		});

		it.each(cases)("agrees with sjsonnet on %s", (_name, code) => {
			expect(evaluates(code)).toBe(true);
		});
	});

	describe("constructs both the grammar and sjsonnet reject", () => {
		// These are not gaps. Jsonnet numbers follow JSON, so `.5` is invalid,
		// and `|||` that does not end its line is not a text block.
		const cases: [string, string][] = [
			["a number with no leading digit", "{ x: .5 }"],
			["an unterminated text block", "{ x: |||\n  a\n"],
			["a triple bar inside one line", "{ x: true ||| false }"],
		];

		it.each(cases)("rejects %s", (_name, code) => {
			expect(parses(code)).toBe(false);
			expect(evaluates(code)).toBe(false);
		});
	});

	describe("operators that share a prefix stay distinct", () => {
		it.each([
			["logical or", "{ x: true || false }"],
			["bitwise or", "{ x: 6 | 3 }"],
			["comment, not division", "{ x: 1 // c\n }"],
		])("parses %s", (_name, code) => {
			expect(parseErrors(code)).toBe(0);
		});
	});

	it("parses every checked-in example manifest", () => {
		const files = jsonnetFilesUnder("tests/examples");
		expect(files.length).toBeGreaterThan(0);

		const failures: string[] = [];
		for (const file of files) {
			const errors = parseErrors(readFileSync(file, "utf8"));
			if (errors > 0) failures.push(`${file} (${errors} errors)`);
		}
		expect(failures).toEqual([]);
	});
});
