import { describe, it, expect } from "vitest";
import { highlightJsonnet } from "../jsonnet/highlight-static.js";

const SAMPLE = `local bubble_text = 'Collagen!!';  // (1)
{
  attrs: { viewBox: '0 0 500 400' },
  children: [{ image_path: 'images/smiley.jpg' }],
  n: 123,
}`;

describe("highlightJsonnet", () => {
	it("reproduces the input exactly when tokens are rejoined", () => {
		// The critical property: highlighting must never drop or reorder source.
		const rejoined = highlightJsonnet(SAMPLE)
			.map(t => t.text)
			.join("");
		expect(rejoined).toBe(SAMPLE);
	});

	it("styles comments, strings and numbers", () => {
		const tokens = highlightJsonnet(SAMPLE);
		const classOf = (needle: string) =>
			tokens.find(t => t.text.includes(needle))?.className ?? null;

		expect(classOf("// (1)")).toContain("tok-comment");
		expect(classOf("'Collagen!!'")).toContain("tok-string");
		expect(classOf("123")).toContain("tok-number");
	});

	it("marks the local keyword", () => {
		const tokens = highlightJsonnet(SAMPLE);
		const local = tokens.find(t => t.text === "local");
		expect(local?.className).toBeTruthy();
	});

	it("handles an empty string without throwing", () => {
		expect(highlightJsonnet("")).toEqual([]);
	});
});
