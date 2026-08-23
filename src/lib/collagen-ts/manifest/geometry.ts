/**
 * Turning a canvas gesture into attribute changes.
 *
 * Most SVG shapes carry their position in their own attributes, and moving one
 * should edit those rather than wrap it in a transform: `x` and `y` are what
 * the author wrote and what they will read back. Shapes with no such
 * attributes -- paths, polygons, groups -- fall back to composing a transform,
 * which works for anything.
 */

import type { XmlAttrs } from "../types/index.js";

/** One attribute to write. */
export interface AttrEdit {
	key: string;
	value: string | number;
}

/** The attributes each shape uses to position itself. */
const POSITION_ATTRS: Record<string, readonly [string, string][]> = {
	rect: [["x", "y"]],
	image: [["x", "y"]],
	svg: [["x", "y"]],
	use: [["x", "y"]],
	foreignObject: [["x", "y"]],
	text: [["x", "y"]],
	tspan: [["x", "y"]],
	circle: [["cx", "cy"]],
	ellipse: [["cx", "cy"]],
	// A line moves by both of its endpoints.
	line: [
		["x1", "y1"],
		["x2", "y2"],
	],
};

/** The attributes each shape uses for its size. */
const SIZE_ATTRS: Record<string, readonly [string, string]> = {
	rect: ["width", "height"],
	image: ["width", "height"],
	svg: ["width", "height"],
	use: ["width", "height"],
	foreignObject: ["width", "height"],
	ellipse: ["rx", "ry"],
};

/** Read an attribute as a number, treating anything unparseable as absent. */
function numberOf(attrs: XmlAttrs, key: string): number | null {
	const raw = attrs[key];
	if (raw === undefined) return null;
	const value = typeof raw === "number" ? raw : Number(raw);
	return Number.isFinite(value) ? value : null;
}

/**
 * Attribute changes that move a shape by `(dx, dy)` in user units.
 *
 * Returns null when the shape has no position attributes, or when it has them
 * but they hold something this cannot read -- a percentage, a `calc()`, or a
 * unit suffix. The caller then falls back to a transform, which is correct
 * whatever the attributes say.
 */
export function translateEdits(
	tagName: string,
	attrs: XmlAttrs,
	dx: number,
	dy: number,
): AttrEdit[] | null {
	const pairs = POSITION_ATTRS[tagName];
	if (!pairs) return null;

	const edits: AttrEdit[] = [];
	for (const [xKey, yKey] of pairs) {
		// An absent coordinate defaults to 0 in SVG, so writing dx is right.
		// A present one this cannot parse is a different matter.
		const x = attrs[xKey] === undefined ? 0 : numberOf(attrs, xKey);
		const y = attrs[yKey] === undefined ? 0 : numberOf(attrs, yKey);
		if (x === null || y === null) return null;

		// An axis that did not move is left alone. Writing it anyway would make
		// a straight vertical drag fail on an element whose `x` happens to be
		// an expression, which has nothing to do with the gesture.
		if (dx !== 0) edits.push({ key: xKey, value: x + dx });
		if (dy !== 0) edits.push({ key: yKey, value: y + dy });
	}
	return edits;
}

/**
 * Attribute changes that resize a shape to `width` by `height`, anchored at
 * `(x, y)`.
 *
 * A circle has one radius for both axes, so it takes the smaller of the two
 * and stays a circle.
 */
export function resizeEdits(
	tagName: string,
	x: number,
	y: number,
	width: number,
	height: number,
): AttrEdit[] | null {
	if (tagName === "circle") {
		const radius = Math.min(width, height) / 2;
		return [
			{ key: "cx", value: x + width / 2 },
			{ key: "cy", value: y + height / 2 },
			{ key: "r", value: radius },
		];
	}

	if (tagName === "ellipse") {
		return [
			{ key: "cx", value: x + width / 2 },
			{ key: "cy", value: y + height / 2 },
			{ key: "rx", value: width / 2 },
			{ key: "ry", value: height / 2 },
		];
	}

	if (tagName === "line") {
		return [
			{ key: "x1", value: x },
			{ key: "y1", value: y },
			{ key: "x2", value: x + width },
			{ key: "y2", value: y + height },
		];
	}

	const size = SIZE_ATTRS[tagName];
	if (!size) return null;

	return [
		{ key: "x", value: x },
		{ key: "y", value: y },
		{ key: size[0], value: width },
		{ key: size[1], value: height },
	];
}

const LEADING_TRANSLATE =
	/^\s*translate\(\s*(-?[\d.]+(?:e-?\d+)?)\s*(?:[,\s]\s*(-?[\d.]+(?:e-?\d+)?))?\s*\)/i;

/**
 * A `transform` value that moves the element a further `(dx, dy)`.
 *
 * A translate already at the front is folded into rather than stacked on, so
 * dragging something repeatedly does not grow an ever longer attribute.
 * Anything else is prefixed, which composes correctly because the new
 * translate then applies in the parent's coordinate system -- exactly what
 * dragging on screen means.
 */
export function composeTranslate(
	existing: string | number | undefined,
	dx: number,
	dy: number,
): string {
	const current = existing === undefined ? "" : String(existing).trim();
	if (current === "") return `translate(${round(dx)}, ${round(dy)})`;

	const match = LEADING_TRANSLATE.exec(current);
	if (match) {
		const x = Number(match[1]) + dx;
		const y = (match[2] === undefined ? 0 : Number(match[2])) + dy;
		const rest = current.slice(match[0].length).trim();
		const merged = `translate(${round(x)}, ${round(y)})`;
		return rest === "" ? merged : `${merged} ${rest}`;
	}

	return `translate(${round(dx)}, ${round(dy)}) ${current}`;
}

function round(value: number): number {
	return Number(value.toFixed(3));
}

/**
 * How a move should be written for this shape.
 *
 * `attrs` edits are preferred; `transform` is the fallback that works for
 * anything, including groups, paths, and shapes whose coordinates are computed.
 */
export function moveEdits(
	tagName: string,
	attrs: XmlAttrs,
	dx: number,
	dy: number,
): AttrEdit[] {
	return (
		translateEdits(tagName, attrs, dx, dy) ?? [
			{ key: "transform", value: composeTranslate(attrs.transform, dx, dy) },
		]
	);
}
