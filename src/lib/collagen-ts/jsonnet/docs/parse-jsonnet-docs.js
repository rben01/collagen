/// This file is not meant to be used by this app. It is meant to be run directly on
/// https://jsonnet.org/ref/stdlib.html to extract the docs as json so that they can be
/// pasted in jsonnet-stdlib-completions.ts to be used as completions.

const data = [];
let o = {};
document.querySelectorAll(".hgroup").forEach(hgroup => {
	const func = hgroup.querySelector("h4")?.innerText.trim();
	if (func) {
		if (o.func) {
			data.push(o);
			o = {};
		}
		o.func = func;
	} else {
		hgroup.querySelectorAll("p").forEach(p => {
			const text = p.innerText;
			if (!o.func || text.includes("Available since version")) {
				return;
			}
			if (!o.docs) {
				o.docs = [];
			}
			o.docs.push(text.trim());
		});
	}
});

data.push(
	{ func: "std.abs(n)", docs: ["The absolute value of n"] },
	{
		func: "std.sign(n)",
		docs: ["Return 1 if n > 0, -1 if n < 0, and 0 if n == 0"],
	},
	{ func: "std.max(a, b)", docs: [] },
	{ func: "std.min(a, b)", docs: [] },
	{ func: "std.pow(x, n)", docs: ["x^n"] },
	{ func: "std.exp(x)", docs: ["e^x"] },
	{ func: "std.log(x)", docs: ["The natural log of x"] },
	{ func: "std.log2(x)", docs: [] },
	{ func: "std.log10(x)", docs: [] },
	{
		func: "std.exponent(x)",
		docs: ["The exponent of x as a floating point number"],
	},
	{
		func: "std.mantissa(x)",
		docs: ["The mantissa of x as a floating point number"],
	},
	{
		func: "std.floor(x)",
		docs: ["The greatest integer less than or equal to x"],
	},
	{
		func: "std.ceil(x)",
		docs: ["The least integer greater than or equal to x"],
	},
	{ func: "std.sqrt(x)", docs: ["The square root of x"] },
	{ func: "std.sin(x)", docs: [] },
	{ func: "std.cos(x)", docs: [] },
	{ func: "std.tan(x)", docs: [] },
	{ func: "std.asin(x)", docs: [] },
	{ func: "std.acos(x)", docs: [] },
	{ func: "std.atan(x)", docs: [] },
	{ func: "std.atan2(y, x)", docs: [] },
	{ func: "std.deg2rad(x)", docs: ["Convert an angle in degrees to radians"] },
	{ func: "std.rad2deg(x)", docs: ["Convert an angle in radians to degrees"] },
	{
		func: "std.hypot(a, b)",
		docs: [
			"sqrt(a^2 + b^2), but avoiding rounding errors when a and b are of different magnitudes",
		],
	},
	{ func: "std.round(x)", docs: ["Round x to the nearest integer"] },
	{ func: "std.isEven(x)", docs: ["Whether the integral part of x is even"] },
	{ func: "std.isOdd(x)", docs: ["Whether the integral part of x is od"] },
	{
		func: "std.mod(a, b)",
		docs: [
			"The % operator. If a is a number, returns a modulo b. If a is a string, calls std.format",
		],
	},
	{ func: "std.isInteger(x)", docs: ["Whether x is an integer"] },
	{ func: "std.isDecimal(x)", docs: ["Whether x is not an integer"] },
	{ func: "std.pi", docs: ["The constant pi"] },
);

console.log({ data });
