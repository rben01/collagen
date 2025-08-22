/**
 * Test Jsonnet support in Collagen TypeScript implementation
 */

import { describe, it, expect } from "vitest";
import { generateSvgFromFiles, getSupportedFormats } from "../index.js";
import { createFileFromString, TEST_IMAGE_PNG } from "./test-utils.js";

describe("Jsonnet Support", () => {
	it("should include jsonnet in supported formats", () => {
		const formats = getSupportedFormats();
		expect(formats).toContain("json");
		expect(formats).toContain("jsonnet");
	});

	it("should handle simple Jsonnet compilation", async () => {
		const jsonnetManifest = `
			{
				attrs: { viewBox: "0 0 100 100" },
				children: [
					{
						tag: "circle",
						attrs: {
							cx: 50,
							cy: 50,
							r: 25,
							fill: "blue"
						}
					}
				]
			}
		`;

		const files = new Map<string, File>([
			[
				"collagen.jsonnet",
				createFileFromString(jsonnetManifest, "collagen.jsonnet"),
			],
		]);

		expect(await generateSvgFromFiles(files)).toContain("<svg");
	}, 1000);

	it("should handle Jsonnet with variables", async () => {
		const jsonnetManifest = `
			local width = 200;
			local height = 200;

			{
				attrs: { viewBox: "0 0 %d %d" % [width, height] },
				children: [
					{
						tag: "rect",
						attrs: {
							x: 0,
							y: 0,
							width: width,
							height: height,
							fill: "red"
						}
					}
				]
			}
		`;

		const files = new Map<string, File>([
			[
				"collagen.jsonnet",
				createFileFromString(jsonnetManifest, "collagen.jsonnet"),
			],
		]);

		expect(await generateSvgFromFiles(files)).toContain('"0 0 200 200"');
	}, 1000);

	it("should handle Jsonnet with loops (pinwheel example)", async () => {
		const pinwheelJsonnet = `
			local width = 400;
			local height = width;
			local n_spokes = 16;
			local cx = width / 2;
			local cy = height / 2;
			local spoke_length = width * 0.75;
			local pi = std.acos(-1);

			{
				attrs: {
					viewBox: "0 0 %d %d" % [width, height],
				},
				children: [
					{
						local t = i / n_spokes,
						local theta = t * pi,
						local dx = (spoke_length / 2) * std.cos(theta),
						local dy = (spoke_length / 2) * std.sin(theta),

						tag: "line",
						attrs: {
							x1: cx + dx,
							x2: cx - dx,
							y1: cy + dy,
							y2: cy - dy,
							stroke: "hsl(" + std.toString(360 * t) + ", 100%, 50%)",
							"stroke-width": 5,
							"stroke-linecap": "round",
						},
					}
					for i in std.range(0, n_spokes - 1)
				],
			}
		`;

		const files = new Map<string, File>([
			[
				"collagen.jsonnet",
				createFileFromString(pinwheelJsonnet, "collagen.jsonnet"),
			],
		]);

		// check the output, this is one of the spokes
		expect(await generateSvgFromFiles(files)).toContain(
			'<line stroke="hsl(180, 100%, 50%)" stroke-linecap="round" stroke-width="5" x1="200" x2="200" y1="350" y2="50"',
		);
	}, 1000);

	it("should handle Jsonnet with image references", async () => {
		const jsonnetManifest = `
			{
				attrs: { viewBox: "0 0 100 100" },
				children: [
					{
						image_path: "test.png"
					}
				]
			}
		`;

		const files = new Map<string, File>([
			[
				"collagen.jsonnet",
				createFileFromString(jsonnetManifest, "collagen.jsonnet"),
			],
			[
				"test.png",
				new File([TEST_IMAGE_PNG], "test.png", { type: "image/png" }),
			],
		]);

		// This is that test png, base64 encoded
		expect(await generateSvgFromFiles(files)).toContain(
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVQI12P4DwAAAQABXHKoZgAAAABJRU5ErkJggg==",
		);
	}, 1000);

	it("should prefer jsonnet over json when both exist", async () => {
		const jsonManifest = JSON.stringify({
			attrs: { viewBox: "0 0 100 100" },
			children: [
				{ tag: "circle", attrs: { cx: 50, cy: 50, r: 20, fill: "red" } },
			],
		});

		const jsonnetManifest = `
			{
				attrs: { viewBox: "0 0 100 100" },
				children: [
					{
						tag: "circle",
						attrs: {
							cx: 50,
							cy: 50,
							r: 25,
							fill: "blue"
						}
					}
				]
			}
		`;

		const files = new Map<string, File>([
			["collagen.json", createFileFromString(jsonManifest, "collagen.json")],
			[
				"collagen.jsonnet",
				createFileFromString(jsonnetManifest, "collagen.jsonnet"),
			],
		]);

		expect(await generateSvgFromFiles(files)).toContain('fill="blue"');
	}, 1000);
});
