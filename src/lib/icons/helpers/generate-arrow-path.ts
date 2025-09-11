/**
 * Generate SVG arc command for a ccw semicircle
 * @param r The radius of the circle
 * @param angle Angle from the x-axis to the diameter we're traversing. 0 = ⯊, pi/2 = ◖,
 * pi = ⯋, 3pi/2 = ◗
 */
function arcSemicircle(r: number, angle: number): string {
	const dx = -2 * r * Math.cos(angle);
	const dy = 2 * r * Math.sin(angle);
	return arc(r, dx, dy);
}

/**
 * Generate SVG arc command for a ccw arc
 * @param r The radius of the circle
 * @param dx Same as the arc command
 * @param dy Same as the arc command
 */
function arc(r: number, dx: number, dy: number): string {
	return `a ${r} ${r} 0 0 0 ${dx} ${dy}`;
}

/**
 * Generates an SVG path outline for a left-pointing arrow like ←. The "points" of the
 * arrow are all semicircles of radius r, and the lines have thickness 2r.
 * @param head The starting point coordinates [x, y] of the arrow head
 * @param headPointD The displacement vector [dx, dy] from the arrow head of the
 * head's tips
 * @param length The length of the arrow shaft
 * @param r The thickness/radius of the arrow outline
 * @returns SVG path string defining the arrow outline
 */
function generateArrowOutline(
	head: [number, number],
	headPointD: [number, number],
	length: number,
	r: number,
) {
	function push(step: string) {
		steps.push(step);
	}

	const [a, b] = head;
	const [hDx, hDy] = headPointD;

	const m = hDy / hDx; // slope of head's points
	const c2 = 1 + m ** 2; // hypotenuse^2 in a right triangle with legs 1 and m
	const w = (r * c2 ** 0.5) / m; // half the horizontal thickness of the head's (slanted) tips
	const rx = r / c2 ** 0.5; // horizontal leg of right triangle with hypot = r
	const ry = m * rx; // vertical leg of same
	const pitX = a + w + r / m;

	const steps: string[] = [];
	push(`M ${a + length} ${b - r}`); // to above the tail (not counting radius of shaft tip)
	push(`H ${pitX}`); // to junction of upper shaft and upper head-tip: ∠

	// to before we draw the semicircle of the head's upper tip
	push(`L ${a + hDx + rx} ${b - hDy + ry}`);

	// arc around upper tip
	push(arcSemicircle(r, Math.atan2(-1, m)));

	// down to arrowhead
	push(`L ${a - rx} ${b - ry}`);

	// arrowhead arc
	push(arc(r, 0, 2 * ry));

	// to before we draw the semicircle of the head's lower tip
	push(`L ${a + hDx - rx} ${b + hDy + ry}`);

	// arc around lower tip
	push(arcSemicircle(r, Math.atan2(-1, -m)));

	// to below shaft
	push(`L ${pitX} ${b + r}`);

	// to before shaft tip semicircle
	push(`H ${a + length}`);

	// shaft tip semicircle
	push(arcSemicircle(r, 1.5 * Math.PI));

	push("z");

	return steps.join(" ").replaceAll(/[\d.]+e-\d+/g, "0");
}

console.log(generateArrowOutline([0, 0], [3, 3], 7, 1));
