/**
 * Unit tests for text file detection helper
 */

import { describe, it, expect } from "vitest";
import { isTextPath } from "../filesystem/index.js";

describe("isTextPath", () => {
	it("detects common text formats", () => {
		expect(isTextPath("collagen.json")).toBe(true);
		expect(isTextPath("collagen.jsonnet")).toBe(true);
		expect(isTextPath("README.md")).toBe(true);
		expect(isTextPath("notes.txt")).toBe(true);
		expect(isTextPath("config.yaml")).toBe(true);
		expect(isTextPath("index.html")).toBe(true);
		expect(isTextPath("styles.css")).toBe(true);
		expect(isTextPath("script.ts")).toBe(true);
		expect(isTextPath("module.js")).toBe(true);
		expect(isTextPath("data.xml")).toBe(true);
	});

	it("returns false for images and fonts", () => {
		expect(isTextPath("image.png")).toBe(false);
		expect(isTextPath("photo.jpeg")).toBe(false);
		expect(isTextPath("icon.svg")).toBe(false);
		expect(isTextPath("font.woff2")).toBe(false);
		expect(isTextPath("font.ttf")).toBe(false);
	});
});
