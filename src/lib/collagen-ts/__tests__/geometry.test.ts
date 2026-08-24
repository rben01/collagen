/**
 * Turning a canvas gesture into attribute changes.
 */

import { describe, it, expect } from "vitest";
import {
	changedEdits,
	composeTranslate,
	moveEdits,
	resizeEdits,
	translateEdits,
} from "../manifest/geometry.js";

describe("translateEdits", () => {
	it("moves a rect by its x and y", () => {
		expect(translateEdits("rect", { x: 10, y: 20 }, 5, -3)).toEqual([
			{ key: "x", value: 15 },
			{ key: "y", value: 17 },
		]);
	});

	it("moves a circle by its centre", () => {
		expect(translateEdits("circle", { cx: 0, cy: 0 }, 4, 4)).toEqual([
			{ key: "cx", value: 4 },
			{ key: "cy", value: 4 },
		]);
	});

	it("moves both ends of a line", () => {
		expect(
			translateEdits("line", { x1: 0, y1: 0, x2: 10, y2: 10 }, 2, 0),
		).toEqual([
			{ key: "x1", value: 2 },
			{ key: "x2", value: 12 },
		]);
	});

	it("treats an absent coordinate as zero, which is what SVG does", () => {
		expect(translateEdits("rect", {}, 7, 8)).toEqual([
			{ key: "x", value: 7 },
			{ key: "y", value: 8 },
		]);
	});

	it("leaves an axis alone when it did not move", () => {
		// Otherwise a straight vertical drag fails on an element whose `x`
		// happens to be an expression, which has nothing to do with the gesture.
		expect(translateEdits("rect", { x: 10, y: 20 }, 0, 5)).toEqual([
			{ key: "y", value: 25 },
		]);
	});

	it("declines a shape with no position attributes", () => {
		expect(translateEdits("path", { d: "M0 0" }, 1, 1)).toBeNull();
	});

	it("declines a coordinate it cannot read", () => {
		expect(translateEdits("rect", { x: "50%", y: 0 }, 1, 1)).toBeNull();
	});
});

describe("moveEdits", () => {
	it("falls back to a transform for a shape with no position attributes", () => {
		expect(moveEdits("g", {}, 3, 4)).toEqual([
			{ key: "transform", value: "translate(3, 4)" },
		]);
	});
});

describe("composeTranslate", () => {
	it("starts a transform when there is none", () => {
		expect(composeTranslate(undefined, 5, 6)).toBe("translate(5, 6)");
	});

	it("folds into a translate already at the front, rather than stacking", () => {
		expect(composeTranslate("translate(10, 20)", 5, -5)).toBe(
			"translate(15, 15)",
		);
	});

	it("keeps whatever follows the translate", () => {
		expect(composeTranslate("translate(10, 20) rotate(30)", 1, 1)).toBe(
			"translate(11, 21) rotate(30)",
		);
	});

	it("handles a one-argument translate, whose y defaults to zero", () => {
		expect(composeTranslate("translate(10)", 0, 5)).toBe("translate(10, 5)");
	});

	it("prefixes anything it cannot fold into", () => {
		expect(composeTranslate("rotate(30)", 2, 3)).toBe(
			"translate(2, 3) rotate(30)",
		);
	});
});

describe("resizeEdits", () => {
	it("sizes a rect by its box", () => {
		expect(resizeEdits("rect", 5, 6, 20, 30)).toEqual([
			{ key: "x", value: 5 },
			{ key: "y", value: 6 },
			{ key: "width", value: 20 },
			{ key: "height", value: 30 },
		]);
	});

	it("keeps a circle circular by taking the smaller axis", () => {
		expect(resizeEdits("circle", 0, 0, 40, 20)).toEqual([
			{ key: "cx", value: 20 },
			{ key: "cy", value: 10 },
			{ key: "r", value: 10 },
		]);
	});

	it("gives an ellipse both radii", () => {
		expect(resizeEdits("ellipse", 0, 0, 40, 20)).toEqual([
			{ key: "cx", value: 20 },
			{ key: "cy", value: 10 },
			{ key: "rx", value: 20 },
			{ key: "ry", value: 10 },
		]);
	});

	it("declines a shape with no size attributes", () => {
		expect(resizeEdits("path", 0, 0, 10, 10)).toBeNull();
	});
});

describe("changedEdits", () => {
	it("drops an edit that writes back the value already there", () => {
		// The case that mattered: a south-east resize leaves x and y alone, and
		// attempting them anyway failed the whole gesture when x was computed.
		const edits = [
			{ key: "x", value: 40 },
			{ key: "y", value: 30 },
			{ key: "width", value: 180 },
			{ key: "height", value: 100 },
		];
		expect(
			changedEdits({ x: 40, y: 30, width: 120, height: 70 }, edits),
		).toEqual([
			{ key: "width", value: 180 },
			{ key: "height", value: 100 },
		]);
	});

	it("treats a number and its string form as the same value", () => {
		expect(changedEdits({ x: "40" }, [{ key: "x", value: 40 }])).toEqual([]);
	});

	it("keeps an edit for an attribute that is not there yet", () => {
		expect(changedEdits({}, [{ key: "fill", value: "red" }])).toEqual([
			{ key: "fill", value: "red" },
		]);
	});

	it("keeps everything when everything changed", () => {
		const edits = [
			{ key: "x", value: 1 },
			{ key: "y", value: 2 },
		];
		expect(changedEdits({ x: 0, y: 0 }, edits)).toEqual(edits);
	});
});
