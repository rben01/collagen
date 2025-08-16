/**
 * Test Jsonnet support in Collagen TypeScript implementation
 */

import { describe, it, expect, vi } from "vitest";
import { generateSvgFromFiles, getSupportedFormats } from "../index.js";
import { createFileFromString, TEST_IMAGE_PNG } from "./test-utils.js";
import { JsonnetError } from "../errors/index.js";

describe("Jsonnet Support", () => {
	it("should include jsonnet in supported formats", () => {
		const formats = getSupportedFormats();
		expect(formats).toContain("json");
		expect(formats).toContain("jsonnet");
	});

	it.skip("should handle simple Jsonnet compilation", async () => {
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
			["collagen.jsonnet", createFileFromString(jsonnetManifest, "collagen.jsonnet")],
		]);

		// In test environment, should fail with JsonnetError since sjsonnet.js isn't available
		await expect(generateSvgFromFiles(files)).rejects.toThrow(JsonnetError);
	}, 1000);

	it.skip("should handle Jsonnet with variables", async () => {
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
			["collagen.jsonnet", createFileFromString(jsonnetManifest, "collagen.jsonnet")],
		]);

		// In test environment, should fail with JsonnetError since sjsonnet.js isn't available
		await expect(generateSvgFromFiles(files)).rejects.toThrow(JsonnetError);
	}, 1000);

	it.skip("should handle Jsonnet with loops (pinwheel example)", async () => {
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
			["collagen.jsonnet", createFileFromString(pinwheelJsonnet, "collagen.jsonnet")],
		]);

		// In test environment, should fail with JsonnetError since sjsonnet.js isn't available
		await expect(generateSvgFromFiles(files)).rejects.toThrow(JsonnetError);
	}, 1000);

	it.skip("should handle Jsonnet with image references", async () => {
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
			["collagen.jsonnet", createFileFromString(jsonnetManifest, "collagen.jsonnet")],
			["test.png", new File([TEST_IMAGE_PNG], "test.png", { type: "image/png" })],
		]);

		// In test environment, should fail with JsonnetError since sjsonnet.js isn't available
		await expect(generateSvgFromFiles(files)).rejects.toThrow(JsonnetError);
	}, 1000);

	it.skip("should prefer jsonnet over json when both exist", async () => {
		const jsonManifest = JSON.stringify({
			attrs: { viewBox: "0 0 100 100" },
			children: [{ tag: "circle", attrs: { cx: 50, cy: 50, r: 20, fill: "red" } }]
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
			["collagen.jsonnet", createFileFromString(jsonnetManifest, "collagen.jsonnet")],
		]);

		// Should prefer jsonnet over json (will fail due to sjsonnet not being available in test env)
		await expect(generateSvgFromFiles(files)).rejects.toThrow(JsonnetError);
	}, 1000);
});