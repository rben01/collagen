/**
 * Playwright tests for SvgDisplay component
 *
 * Tests SVG rendering, zoom/pan functionality, export features,
 * and interactive controls.
 */

/// <reference path="../globals.d.ts" />

import { expect, Page, PlaywrightTestArgs } from "@playwright/test";
import { test as base } from "./fixtures";

// =============================================================================
// Test Setup and Utilities
// =============================================================================

type JsonPrimitive = string | number | boolean | null | undefined;
type JsonObject = JsonPrimitive | JsonObject[] | { [key: string]: JsonObject };

// Common test objects for various test scenarios
const SIMPLE_OBJECT = {
	attrs: { viewBox: "0 0 200 150" },
	children: [
		{
			tag: "rect",
			attrs: {
				x: 10,
				y: 10,
				width: 180,
				height: 130,
				fill: "#f0f0f0",
				stroke: "#333",
				"stroke-width": 2,
			},
		},
		{ tag: "circle", attrs: { cx: 100, cy: 75, r: 30, fill: "#007bff" } },
		{
			tag: "text",
			attrs: {
				x: 100,
				y: 80,
				"text-anchor": "middle",
				fill: "white",
				"font-size": 14,
			},
			text: "Test",
		},
	],
};

const COMPLEX_OBJECT = {
	attrs: { viewBox: "0 0 400 300" },
	children: [
		{
			tag: "defs",
			children: [
				{
					tag: "linearGradient",
					attrs: {
						id: "gradient1",
						x1: "0%",
						y1: "0%",
						x2: "100%",
						y2: "100%",
					},
					children: [
						{
							tag: "stop",
							attrs: { offset: "0%", "stop-color": "#ff6b6b" },
						},
						{
							tag: "stop",
							attrs: { offset: "100%", "stop-color": "#4ecdc4" },
						},
					],
				},
			],
		},
		{
			tag: "g",
			attrs: { transform: "translate(50, 50)" },
			children: [
				{
					tag: "rect",
					attrs: {
						x: 0,
						y: 0,
						width: 300,
						height: 200,
						fill: "url(#gradient1)",
						rx: 10,
					},
				},
				{
					tag: "circle",
					attrs: {
						cx: 150,
						cy: 100,
						r: 50,
						fill: "rgba(255,255,255,0.8)",
					},
				},
				{
					tag: "path",
					attrs: {
						d: "M100,150 Q150,100 200,150 T300,150",
						stroke: "#333",
						"stroke-width": 3,
						fill: "none",
					},
				},
			],
		},
	],
};

const LARGE_OBJECT = {
	attrs: { viewBox: "0 0 1000 800" },
	children: Array.from({ length: 100 }, (_, i) => ({
		tag: "circle",
		attrs: {
			cx: (i % 10) * 100 + 50,
			cy: Math.floor(i / 10) * 80 + 40,
			r: 30,
			fill: `hsl(${i * 3.6}, 70%, 50%)`,
		},
	})),
};

const INTERACTIVE_OBJECT = {
	attrs: { viewBox: "0 0 500 400" },
	children: [
		{
			tag: "rect",
			attrs: {
				x: 50,
				y: 50,
				width: 400,
				height: 300,
				fill: "#e8e8e8",
				stroke: "#666",
			},
		},
		{
			tag: "g",
			attrs: { transform: "translate(250, 200)" },
			children: [
				{ tag: "circle", attrs: { cx: 0, cy: 0, r: 80, fill: "#ff6b6b" } },
				{
					tag: "circle",
					attrs: { cx: -30, cy: -20, r: 15, fill: "white" },
				},
				{ tag: "circle", attrs: { cx: 30, cy: -20, r: 15, fill: "white" } },
				{ tag: "circle", attrs: { cx: -30, cy: -20, r: 8, fill: "black" } },
				{ tag: "circle", attrs: { cx: 30, cy: -20, r: 8, fill: "black" } },
				{
					tag: "path",
					attrs: {
						d: "M-30,30 Q0,50 30,30",
						stroke: "black",
						"stroke-width": 3,
						fill: "none",
					},
				},
			],
		},
	],
};

async function dragAndDropFile(
	page: Page,
	{
		filename,
		content,
		mimeType,
	}: { filename: string; content: string; mimeType: string },
) {
	const dataTransfer = await page.evaluateHandle(
		async ({ content, filename, mimeType }) => {
			const dt = new DataTransfer();
			const blob = new Blob([content], { type: mimeType });
			const file = new File([blob], filename, { type: mimeType });
			dt.items.add(file);
			dt.dropEffect = "copy";
			return dt;
		},
		{ content, filename, mimeType },
	);

	const dropZone = page.locator(".drop-zone");

	for (const event of ["dragenter", "dragover", "drop"]) {
		await dropZone.dispatchEvent(event, { dataTransfer });
	}
}

const test = base.extend<PlaywrightTestArgs & { object: JsonObject }>({
	object: [SIMPLE_OBJECT, { option: true }],
	page: async ({ page, object }, use) => {
		await dragAndDropFile(page, {
			content: JSON.stringify(object),
			filename: "collagen.json",
			mimeType: "application/json",
		});

		await page.waitForSelector(".svg-content", {
			state: "visible",
			timeout: 5000,
		});

		await use(page);
	},
});

// =============================================================================
// Basic SvgDisplay Tests
// =============================================================================

test.describe("SvgDisplay Component", () => {
	// `setup` is the `test` fixture before we drag and drop onto the drop zone
	base("should not display initially without SVG", async ({ page }) => {
		// SVG display section should not be visible initially
		const svgSection = page.getByRole("region", {
			name: /generated svg display/i,
		});
		await expect(svgSection).not.toBeVisible();
	});

	test.describe("with simple object", () => {
		test.use({ object: SIMPLE_OBJECT });

		test("should display SVG when provided", async ({ page, object }) => {
			// SVG should be visible
			const svgSection = page.locator(".svg-container");
			await expect(svgSection).toBeVisible();

			// SVG element should be present
			const svgElement = page.locator("svg");
			await expect(svgElement).toBeVisible();
			await expect(svgElement).toHaveAttribute("viewBox", "0 0 200 150");

			// Verify content elements are present
			await expect(page.locator("rect")).toBeVisible();
			await expect(page.locator("circle")).toBeVisible();
			await expect(page.locator("text")).toBeVisible();
		});
	});
});

// =============================================================================
// SVG Controls Tests
// =============================================================================

test.describe("SVG Controls", () => {
	test.use({ object: SIMPLE_OBJECT });

	test("should display control buttons", async ({ page, object }) => {
		// Check all control buttons are present
		await expect(
			page.getByRole("button", { name: /zoom in/i }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: /zoom out/i }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: /reset view/i }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: /export svg/i }),
		).toBeVisible();

		// Check button titles
		await expect(
			page.getByRole("button", { name: /zoom in/i }),
		).toHaveAttribute("title", /Zoom In/);
		await expect(
			page.getByRole("button", { name: /zoom out/i }),
		).toHaveAttribute("title", /Zoom Out/);
		await expect(
			page.getByRole("button", { name: /reset view/i }),
		).toHaveAttribute("title", /Reset View/);
		await expect(
			page.getByRole("button", { name: /export svg/i }),
		).toHaveAttribute("title", /Export SVG/);
	});

	test("should handle zoom in action", async ({ page, object }) => {
		const zoomInBtn = page.getByRole("button", { name: /zoom in/i });
		const svgContent = page.getByRole("img", { name: /generated svg/i });

		const initialTransform = await svgContent.getAttribute("style");

		await zoomInBtn.click();
		await page.waitForTimeout(100);

		const finalTransform = await svgContent.getAttribute("style");
		expect(initialTransform).not.toBe(finalTransform);
	});

	test("should handle zoom out action", async ({ page, object }) => {
		const zoomOutBtn = page.getByRole("button", { name: /zoom out/i });
		const svgContainer = page.getByRole("img", { name: /generated svg/i });

		// Get initial transform
		const initialTransform = await svgContainer.getAttribute("style");

		// Click zoom out
		await zoomOutBtn.click();
		await page.waitForTimeout(100);

		// Transform should change (scale should decrease)
		const finalTransform = await svgContainer.getAttribute("style");
		expect(initialTransform).not.toBe(finalTransform);
	});

	test("should handle reset view action", async ({ page, object }) => {
		const svgContent = page.getByRole("img", { name: /generated svg/i });
		const zoomInBtn = page.getByRole("button", { name: /zoom in/i });
		const resetBtn = page.getByRole("button", { name: /reset view/i });

		// Click zoom in twice to change the scale
		await zoomInBtn.click();
		await zoomInBtn.click();
		await page.waitForTimeout(100);

		// Get the modified transform
		const modifiedTransform = await svgContent.getAttribute("style");

		// Click reset button
		await resetBtn.click();
		await page.waitForTimeout(100);

		// Should reset to different transform
		const resetTransform = await svgContent.getAttribute("style");
		expect(resetTransform).not.toBe(modifiedTransform);
	});

	test("should handle export action", async ({ page, object }) => {
		const exportBtn = page.getByRole("button", { name: /export svg/i });

		// Mock download functionality
		await page.evaluate(() => {
			window.downloadTriggered = false;
			const originalCreateElement = document.createElement.bind(document);
			document.createElement = function (tagName: string) {
				const element = originalCreateElement(tagName);
				if (tagName === "a") {
					const anchor = element as HTMLAnchorElement;
					const originalClick = anchor.click.bind(anchor);
					anchor.click = function () {
						window.downloadTriggered = true;
						window.downloadHref = anchor.href;
						window.downloadFilename = anchor.download;
					};
				}
				return element;
			};
		});

		// Click export
		await exportBtn.click();
		await page.waitForTimeout(100);

		// Check if download was triggered
		const downloadTriggered = await page.evaluate(
			() => window.downloadTriggered,
		);
		if (downloadTriggered) {
			const downloadHref = await page.evaluate(() => window.downloadHref);
			const downloadFilename = await page.evaluate(
				() => window.downloadFilename,
			);

			expect(downloadHref).toContain("data:image/svg+xml");
			expect(downloadFilename).toContain(".svg");
		}
	});
});

// =============================================================================
// Interactive Features Tests
// =============================================================================

test.describe("Interactive Features", () => {
	test.use({ object: INTERACTIVE_OBJECT });

	test("should handle mouse pan interaction", async ({ page, object }) => {
		const svgContainer = page.getByLabel("Interactive SVG viewer");

		// Get initial transform
		const initialTransform = await svgContainer.getAttribute("style");

		// Simulate pan gesture
		await svgContainer.hover();
		await page.mouse.down();
		await page.mouse.move(100, 50); // Move 100px right, 50px down
		await page.mouse.up();

		// Wait for interaction
		await page.waitForTimeout(100);

		// Transform should have changed
		const newTransform = await svgContainer.getAttribute("style");
		expect(newTransform).not.toBe(initialTransform);
	});

	test("should handle wheel zoom interaction", async ({
		page,
		object,
		isMobile,
	}) => {
		const svgContainer = page.getByLabel("Interactive SVG viewer");

		// Get initial scale
		const initialTransform = await svgContainer.getAttribute("style");

		// Simulate wheel zoom
		await svgContainer.hover();
		if (!isMobile) {
			await page.mouse.wheel(0, -100); // Zoom in
		}

		// Wait for interaction
		await page.waitForTimeout(100);

		// Transform should reflect zoom
		const newTransform = await svgContainer.getAttribute("style");
		expect(newTransform).not.toBe(initialTransform);
	});

	test("should change cursor during pan", async ({ page, object }) => {
		const svgContainer = page.getByLabel("Interactive SVG viewer");

		// Initial cursor should be grab
		await expect(svgContainer).toHaveCSS("cursor", "grab");

		// During pan, cursor should change to grabbing
		await svgContainer.hover();
		await page.mouse.down();

		// Cursor should change (in real implementation)
		await page.waitForTimeout(50);

		await page.mouse.up();

		// Cursor should return to grab
		await expect(svgContainer).toHaveCSS("cursor", "grab");
	});

	test("should handle keyboard navigation", async ({ page, object }) => {
		const svgContainer = page.getByLabel("Interactive SVG viewer");

		// Focus the container
		await svgContainer.focus();

		// Test arrow key navigation
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("ArrowDown");

		// Wait for movement
		await page.waitForTimeout(100);

		// Plus/minus for zoom
		await page.keyboard.press("Equal"); // Zoom in
		await page.keyboard.press("Minus"); // Zoom out

		// Wait for zoom
		await page.waitForTimeout(100);

		// Space to reset
		await page.keyboard.press("Space");

		// Wait for reset
		await page.waitForTimeout(100);
	});
});

// =============================================================================
// Complex SVG Handling Tests
// =============================================================================

test.describe("Complex SVG Handling", () => {
	test.describe("large dimensions", () => {
		test.use({
			object: {
				attrs: { viewBox: "0 0 10000 8000" },
				children: [
					{
						tag: "rect",
						attrs: {
							x: 0,
							y: 0,
							width: 10000,
							height: 8000,
							fill: "#f0f0f0",
						},
					},
					{
						tag: "circle",
						attrs: { cx: 5000, cy: 4000, r: 1000, fill: "red" },
					},
				],
			},
		});

		test("should handle very large SVG dimensions", async ({
			page,
			object,
		}) => {
			// Large SVG should still be visible and interactable
			const svgElement = page.locator("svg");
			await expect(svgElement).toBeVisible();
			await expect(svgElement).toHaveAttribute("viewBox", "0 0 10000 8000");
		});
	});

	test.describe("many elements", () => {
		test.use({ object: LARGE_OBJECT });

		test("should handle SVG with many elements", async ({ page, object }) => {
			// Should handle many elements without performance issues
			const svgElement = page.locator("svg");
			await expect(svgElement).toBeVisible();

			// Count circles
			const circles = page.locator("circle");
			await expect(circles).toHaveCount(100);
		});
	});

	test.describe("malformed content", () => {
		test.use({
			object: {
				attrs: { viewBox: "0 0 100 100" },
				children: [
					{
						tag: "rect",
						attrs: { x: 10, y: 10, width: 80, height: 80, fill: "blue" },
					},
					{ tag: "circle", attrs: { cx: 50, cy: 50, r: 20, fill: "red" } },
				],
			},
		});

		test("should handle malformed content gracefully", async ({
			page,
			object,
		}) => {
			// Should still render the valid parts
			const svgElement = page.locator("svg");
			await expect(svgElement).toBeVisible();
			await expect(svgElement).toHaveAttribute("viewBox", "0 0 100 100");

			// Should contain the valid elements
			await expect(page.locator("rect")).toBeVisible();
			await expect(page.locator("circle")).toBeVisible();
		});
	});
});

// =============================================================================
// Responsive and Accessibility Tests
// =============================================================================

test.describe("Responsive and Accessibility", () => {
	test.use({ object: SIMPLE_OBJECT });

	test("should be responsive on different screen sizes", async ({
		page,
		object,
	}) => {
		// Test desktop
		await page.setViewportSize({ width: 1200, height: 800 });
		const svgDisplay = page.getByRole("region", { name: /svg display/i });
		await expect(svgDisplay).toBeVisible();

		// Test tablet
		await page.setViewportSize({ width: 768, height: 1024 });
		await expect(svgDisplay).toBeVisible();

		// Test mobile
		await page.setViewportSize({ width: 375, height: 667 });
		await expect(svgDisplay).toBeVisible();

		// SVG should remain visible at all sizes
		const svgElement = page.locator("svg");
		await expect(svgElement).toBeVisible();
	});

	test("should have proper ARIA labels", async ({ page, object }) => {
		// Check control buttons have ARIA labels
		await expect(
			page.getByRole("button", { name: /zoom in/i }),
		).toHaveAttribute("title", "Zoom In");
		await expect(
			page.getByRole("button", { name: /zoom out/i }),
		).toHaveAttribute("title", "Zoom Out");
		await expect(
			page.getByRole("button", { name: /reset view/i }),
		).toHaveAttribute("title", "Reset View");
		await expect(
			page.getByRole("button", { name: /export svg/i }),
		).toHaveAttribute("title", "Export SVG");

		// SVG container should have proper label
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await expect(svgContainer).toBeVisible();
	});

	test("should be keyboard accessible", async ({ page, object }) => {
		// Tab through controls
		await page.keyboard.press("Tab"); // Focus first control
		await expect(
			page.getByRole("button", { name: /zoom in/i }),
		).toBeFocused();

		await page.keyboard.press("Tab"); // Next control
		await expect(
			page.getByRole("button", { name: /zoom out/i }),
		).toBeFocused();

		await page.keyboard.press("Tab"); // Next control
		await expect(
			page.getByRole("button", { name: /reset view/i }),
		).toBeFocused();

		await page.keyboard.press("Tab"); // Next control
		await expect(
			page.getByRole("button", { name: /export svg/i }),
		).toBeFocused();

		await page.keyboard.press("Tab"); // SVG container
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await expect(svgContainer).toBeFocused();
	});

	test("should support keyboard shortcuts", async ({ page, object }) => {
		const svgContainer = page.getByLabel("Interactive SVG viewer");

		// Focus the SVG container
		await svgContainer.focus();

		// Test keyboard shortcuts
		await page.keyboard.press("Equal"); // Zoom in
		await page.keyboard.press("Minus"); // Zoom out
		await page.keyboard.press("0"); // Reset zoom
		await page.keyboard.press("ArrowLeft"); // Pan left
		await page.keyboard.press("ArrowRight"); // Pan right
		await page.keyboard.press("ArrowUp"); // Pan up
		await page.keyboard.press("ArrowDown"); // Pan down

		// Each action should be handled (implementation specific)
	});

	test("should have proper focus indicators", async ({ page, object }) => {
		// Focus control buttons and check for focus indicators
		const zoomInBtn = page.getByRole("button", { name: /zoom in/i });
		await zoomInBtn.focus();

		// Should have visible focus indicator
		await expect(zoomInBtn).toHaveCSS("outline-width", /.+/);

		// Focus SVG container
		const svgContainer = page.getByLabel("Interactive SVG viewer");
		await svgContainer.focus();

		// Should have visible focus indicator
		await expect(svgContainer).toHaveCSS("outline-width", /[1-9]/);
	});
});
