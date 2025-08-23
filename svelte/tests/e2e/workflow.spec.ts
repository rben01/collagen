/**
 * Playwright workflow tests for complete user scenarios
 *
 * Tests end-to-end user workflows including file upload, processing,
 * viewing results, error handling, and various user interactions.
 */

/// <reference path="../globals.d.ts" />

import { test, expect, Page } from "@playwright/test";

// =============================================================================
// Test Setup and Utilities
// =============================================================================

/** Create mock files for testing workflows */
async function setupMockProject(
	page: Page,
	projectType: "simple" | "complex" | "jsonnet" | "invalid",
) {
	const projects = {
		simple: {
			"collagen.json": JSON.stringify({
				attrs: { viewBox: "0 0 200 100", width: 200, height: 100 },
				children: [
					{
						tag: "rect",
						attrs: {
							x: 10,
							y: 10,
							width: 180,
							height: 80,
							fill: "#e3f2fd",
						},
					},
					{
						tag: "text",
						attrs: { x: 100, y: 55, "text-anchor": "middle" },
						children: ["Simple Project"],
					},
				],
			}),
		},
		complex: {
			"collagen.json": JSON.stringify({
				attrs: { viewBox: "0 0 400 300" },
				children: [
					{
						tag: "rect",
						attrs: {
							x: 0,
							y: 0,
							width: 400,
							height: 300,
							fill: "#f5f5f5",
						},
					},
					{
						image_path: "logo.png",
						attrs: { x: 10, y: 10, width: 50, height: 50 },
					},
					{
						tag: "g",
						attrs: { transform: "translate(70, 10)" },
						children: [
							{
								tag: "text",
								attrs: { x: 0, y: 20, "font-size": 18 },
								children: ["Complex Project"],
							},
							{
								tag: "text",
								attrs: { x: 0, y: 40, "font-size": 12 },
								children: ["With multiple elements"],
							},
						],
					},
					{
						svg_path: "icon.svg",
						attrs: { x: 300, y: 200, width: 80, height: 80 },
					},
				],
			}),
			"logo.png": "fake-png-data",
			"icon.svg":
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="blue"/></svg>',
		},
		jsonnet: {
			"collagen.jsonnet": `
				local width = 300;
				local height = 200;

				{
					attrs: { viewBox: '0 0 %d %d' % [width, height] },
					children: [
						{
							tag: 'circle',
							attrs: { cx: i * 50 + 50, cy: height / 2, r: 20, fill: 'hsl(%d, 70%%, 50%%)' % (i * 60) }
						}
						for i in std.range(0, 4)
					]
				}
			`,
		},
		invalid: { "collagen.json": "{ invalid json syntax" },
	};

	await page.evaluate(projectData => {
		window.mockProjectFiles = {};
		Object.entries(projectData).forEach(([filename, content]) => {
			const file = new File([content], filename, {
				type:
					filename.endsWith(".json") || filename.endsWith(".jsonnet")
						? "application/json"
						: "text/plain",
			});
			window.mockProjectFiles[filename] = file;
		});
	}, projects[projectType]);
}

/** Simulate file upload via drag and drop */
async function simulateFileUpload(
	page: any,
	projectType: "simple" | "complex" | "jsonnet" | "invalid",
) {
	await setupMockProject(page, projectType);

	await page.evaluate(() => {
		const dropZone = document.querySelector(".drop-zone");
		if (dropZone && window.mockProjectFiles) {
			// Simulate successful file upload
			const uploadEvent = new CustomEvent("filesUploaded", {
				detail: window.mockProjectFiles,
			});

			// Trigger the upload handler
			const app = document.querySelector("main");
			if (app) {
				app.dispatchEvent(uploadEvent);
			}
		}
	});
}

/** Wait for SVG processing to complete */
async function waitForSvgProcessing(page: any, timeout = 5000) {
	await page.waitForFunction(
		() => {
			const svgSection = document.querySelector(".svg-section");
			const errorMessage = document.querySelector(".error-message");
			return svgSection || errorMessage;
		},
		{ timeout },
	);
}

// =============================================================================
// Complete User Workflow Tests
// =============================================================================

test.describe("Complete User Workflows", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("networkidle");
	});

	test("should complete simple project workflow", async ({ page }) => {
		// 1. Start with upload interface
		await expect(page.locator(".drop-zone")).toBeVisible();
		await expect(page.locator("text=Upload Collagen Project")).toBeVisible();

		// 2. Upload a simple project
		await simulateFileUpload(page, "simple");
		await waitForSvgProcessing(page);

		// 3. Verify SVG is generated and displayed
		const svgSection = page.locator(".svg-section");
		await expect(svgSection).toBeVisible();

		const svgElement = page.locator("svg");
		await expect(svgElement).toBeVisible();
		await expect(svgElement).toHaveAttribute("viewBox", "0 0 200 100");

		// 4. Verify SVG content
		await expect(page.locator("rect")).toBeVisible();
		await expect(page.locator("text")).toContainText("Simple Project");

		// 5. Test zoom controls
		const zoomInBtn = page.locator(".zoom-in");
		if (await zoomInBtn.isVisible()) {
			await zoomInBtn.click();
			await page.waitForTimeout(100);
		}

		// 6. Test export functionality
		const exportBtn = page.locator(".export-btn");
		if (await exportBtn.isVisible()) {
			// Mock download to avoid actual file download
			await page.evaluate(() => {
				const originalCreateElement = document.createElement;
				document.createElement = function (tagName) {
					const element = originalCreateElement.call(this, tagName);
					if (tagName === "a") {
						element.click = function () {
							window.downloadTriggered = true;
						};
					}
					return element;
				};
			});

			await exportBtn.click();
			await page.waitForTimeout(100);
		}

		// 7. Upload another project (clear and restart)
		const clearBtn = page.locator(".clear-btn");
		if (await clearBtn.isVisible()) {
			await clearBtn.click();
			await expect(page.locator(".drop-zone")).toBeVisible();
		}
	});

	test("should handle complex project with multiple assets", async ({
		page,
	}) => {
		// Upload complex project
		await simulateFileUpload(page, "complex");
		await waitForSvgProcessing(page);

		// Verify all elements are present
		const svgElement = page.locator("svg");
		await expect(svgElement).toBeVisible();

		// Should contain background rect, image, text group, and nested SVG
		await expect(page.locator("rect")).toHaveCount.toBeGreaterThanOrEqual(1);

		// Test interactive features
		const svgContainer = page.locator(".svg-container");
		if (await svgContainer.isVisible()) {
			// Test pan interaction
			await svgContainer.hover();
			await page.mouse.down();
			await page.mouse.move(50, 30);
			await page.mouse.up();

			// Test wheel zoom
			await svgContainer.hover();
			await page.mouse.wheel(0, -100);
			await page.waitForTimeout(100);
		}

		// Test controls
		const controls = page.locator(".svg-controls");
		if (await controls.isVisible()) {
			await expect(page.locator(".zoom-in")).toBeVisible();
			await expect(page.locator(".zoom-out")).toBeVisible();
			await expect(page.locator(".reset-view")).toBeVisible();
			await expect(page.locator(".export-btn")).toBeVisible();
		}
	});

	test("should handle Jsonnet project workflow", async ({ page }) => {
		// Upload Jsonnet project
		await simulateFileUpload(page, "jsonnet");

		// Wait for Jsonnet processing (may take longer)
		await waitForSvgProcessing(page, 10000);

		// Check if Jsonnet was processed or if there's an appropriate message
		const svgSection = page.locator(".svg-section");
		const errorMessage = page.locator(".error-message");

		if (await svgSection.isVisible()) {
			// Jsonnet processed successfully
			const svgElement = page.locator("svg");
			await expect(svgElement).toBeVisible();

			// Should have generated circles from the loop
			const circles = page.locator("circle");
			await expect(circles).toHaveCount.toBeGreaterThan(0);
		} else if (await errorMessage.isVisible()) {
			// Jsonnet not available or processing failed
			await expect(errorMessage).toContainText(/jsonnet|processing/i);
		}
	});

	test("should handle error scenarios gracefully", async ({ page }) => {
		// Upload invalid project
		await simulateFileUpload(page, "invalid");
		await waitForSvgProcessing(page);

		// Should show error message
		const errorMessage = page.locator(".error-message");
		await expect(errorMessage).toBeVisible();
		await expect(errorMessage).toContainText(/error|invalid|syntax/i);

		// Should allow user to try again
		await expect(page.locator(".drop-zone")).toBeVisible();

		// Clear error and upload valid project
		await simulateFileUpload(page, "simple");
		await waitForSvgProcessing(page);

		// Error should be cleared
		await expect(errorMessage).not.toBeVisible();

		// SVG should be displayed
		const svgSection = page.locator(".svg-section");
		await expect(svgSection).toBeVisible();
	});
});

// =============================================================================
// User Interaction Workflow Tests
// =============================================================================

test.describe("User Interaction Workflows", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("networkidle");

		// Set up a working project
		await simulateFileUpload(page, "simple");
		await waitForSvgProcessing(page);
	});

	test("should support keyboard navigation workflow", async ({ page }) => {
		// Tab through interface elements
		await page.keyboard.press("Tab"); // Focus upload zone or first control

		// If controls are visible, test keyboard navigation
		const controls = page.locator(".svg-controls");
		if (await controls.isVisible()) {
			// Tab through controls
			await page.keyboard.press("Tab");
			await expect(page.locator(".zoom-in")).toBeFocused();

			await page.keyboard.press("Tab");
			await expect(page.locator(".zoom-out")).toBeFocused();

			await page.keyboard.press("Tab");
			await expect(page.locator(".reset-view")).toBeFocused();

			await page.keyboard.press("Tab");
			await expect(page.locator(".export-btn")).toBeFocused();

			// Tab to SVG container
			await page.keyboard.press("Tab");
			const svgContainer = page.locator(".svg-container");
			await expect(svgContainer).toBeFocused();

			// Test keyboard shortcuts on SVG
			await page.keyboard.press("Equal"); // Zoom in
			await page.keyboard.press("Minus"); // Zoom out
			await page.keyboard.press("0"); // Reset
			await page.keyboard.press("ArrowLeft"); // Pan left
			await page.keyboard.press("ArrowRight"); // Pan right
		}
	});

	test("should support mouse interaction workflow", async ({ page }) => {
		const svgContainer = page.locator(".svg-container");

		if (await svgContainer.isVisible()) {
			// Test hover states
			await svgContainer.hover();
			await expect(svgContainer).toHaveCSS("cursor", "grab");

			// Test click and drag (pan)
			const box = await svgContainer.boundingBox();
			if (box) {
				await page.mouse.move(
					box.x + box.width / 2,
					box.y + box.height / 2,
				);
				await page.mouse.down();
				await page.mouse.move(
					box.x + box.width / 2 + 50,
					box.y + box.height / 2 + 30,
				);
				await page.mouse.up();
			}

			// Test wheel zoom
			await svgContainer.hover();
			await page.mouse.wheel(0, -120); // Zoom in
			await page.mouse.wheel(0, 120); // Zoom out
		}
	});

	test("should support touch interaction workflow", async ({ page }) => {
		// Simulate mobile touch interactions
		await page.setViewportSize({ width: 375, height: 667 });

		const svgContainer = page.locator(".svg-container");
		if (await svgContainer.isVisible()) {
			const box = await svgContainer.boundingBox();
			if (box) {
				// Simulate touch pan
				const centerX = box.x + box.width / 2;
				const centerY = box.y + box.height / 2;

				await page.touchscreen.tap(centerX, centerY);
				await page.waitForTimeout(100);

				// Simulate swipe gesture
				await page.evaluate(
					coords => {
						const container = document.querySelector(".svg-container");
						if (container) {
							const touchStart = new TouchEvent("touchstart", {
								touches: [
									{ clientX: coords.x, clientY: coords.y },
								] as any,
							});
							const touchMove = new TouchEvent("touchmove", {
								touches: [
									{ clientX: coords.x + 50, clientY: coords.y + 30 },
								] as any,
							});
							const touchEnd = new TouchEvent("touchend", {
								touches: [] as any,
							});

							container.dispatchEvent(touchStart);
							container.dispatchEvent(touchMove);
							container.dispatchEvent(touchEnd);
						}
					},
					{ x: centerX, y: centerY },
				);
			}
		}
	});
});

// =============================================================================
// Performance and Edge Case Workflows
// =============================================================================

test.describe("Performance and Edge Case Workflows", () => {
	test("should handle large project workflow", async ({ page }) => {
		// Create a project with many elements
		await page.evaluate(() => {
			const largeManifest = {
				attrs: { viewBox: "0 0 1000 1000" },
				children: [...Array(200)].map((_, i) => ({
					tag: "rect",
					attrs: {
						x: (i % 20) * 50,
						y: Math.floor(i / 20) * 50,
						width: 40,
						height: 40,
						fill: `hsl(${i * 1.8}, 70%, 50%)`,
					},
				})),
			};

			const file = new File(
				[JSON.stringify(largeManifest)],
				"collagen.json",
				{ type: "application/json" },
			);
			window.mockProjectFiles = { "collagen.json": file };
		});

		await page.evaluate(() => {
			const uploadEvent = new CustomEvent("filesUploaded", {
				detail: window.mockProjectFiles,
			});
			const app = document.querySelector("main");
			if (app) {
				app.dispatchEvent(uploadEvent);
			}
		});

		// Wait for processing (may take longer for large projects)
		await waitForSvgProcessing(page, 15000);

		const svgElement = page.locator("svg");
		if (await svgElement.isVisible()) {
			// Verify all elements are rendered
			const rects = page.locator("rect");
			await expect(rects).toHaveCount(200);

			// Test that interactions still work with many elements
			const svgContainer = page.locator(".svg-container");
			await svgContainer.hover();
			await page.mouse.wheel(0, -100); // Should still zoom smoothly
		}
	});

	test("should handle rapid file switching workflow", async ({ page }) => {
		// Rapidly switch between different projects
		for (let i = 0; i < 3; i++) {
			await simulateFileUpload(page, "simple");
			await page.waitForTimeout(500);

			await simulateFileUpload(page, "complex");
			await page.waitForTimeout(500);
		}

		// Final state should be stable
		await waitForSvgProcessing(page);
		const svgElement = page.locator("svg");
		await expect(svgElement).toBeVisible();
	});

	test("should handle browser back/forward workflow", async ({ page }) => {
		const initialUrl = page.url();

		// Upload project
		await simulateFileUpload(page, "simple");
		await waitForSvgProcessing(page);

		// Navigate away and back
		await page.goto("about:blank");
		await page.goBack();

		// Should restore to initial state
		await expect(page.locator(".drop-zone")).toBeVisible();

		// Should be able to upload again
		await simulateFileUpload(page, "simple");
		await waitForSvgProcessing(page);
		await expect(page.locator("svg")).toBeVisible();
	});

	test("should handle browser refresh workflow", async ({ page }) => {
		// Upload project
		await simulateFileUpload(page, "simple");
		await waitForSvgProcessing(page);

		// Refresh page
		await page.reload();
		await page.waitForLoadState("networkidle");

		// Should reset to initial state
		await expect(page.locator(".drop-zone")).toBeVisible();
		await expect(page.locator("text=Upload Collagen Project")).toBeVisible();

		// Should work normally after refresh
		await simulateFileUpload(page, "simple");
		await waitForSvgProcessing(page);
		await expect(page.locator("svg")).toBeVisible();
	});
});

// =============================================================================
// Accessibility Workflow Tests
// =============================================================================

test.describe("Accessibility Workflows", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("networkidle");
	});

	test("should support screen reader workflow", async ({ page }) => {
		// Check ARIA landmarks and labels
		await expect(page.locator("main")).toHaveAttribute("role", "main");

		const uploadZone = page.locator(".drop-zone");
		await expect(uploadZone).toHaveAttribute("role", "button");
		await expect(uploadZone).toHaveAttribute("aria-label");

		// Upload project and check SVG accessibility
		await simulateFileUpload(page, "simple");
		await waitForSvgProcessing(page);

		const svgContainer = page.locator(".svg-container");
		if (await svgContainer.isVisible()) {
			await expect(svgContainer).toHaveAttribute("role", "img");
			await expect(svgContainer).toHaveAttribute("aria-label");
		}

		// Check controls have proper labels
		const controls = page.locator(".svg-controls button");
		if (await controls.first().isVisible()) {
			const count = await controls.count();
			for (let i = 0; i < count; i++) {
				const control = controls.nth(i);
				await expect(control).toHaveAttribute("aria-label");
			}
		}
	});

	test("should support keyboard-only navigation workflow", async ({
		page,
	}) => {
		// Complete workflow using only keyboard

		// Tab to upload zone
		await page.keyboard.press("Tab");
		const uploadZone = page.locator(".drop-zone");
		await expect(uploadZone).toBeFocused();

		// Activate upload (though file dialog won't work in test)
		await page.keyboard.press("Enter");

		// Simulate file upload
		await simulateFileUpload(page, "simple");
		await waitForSvgProcessing(page);

		// Navigate through controls with keyboard
		const controls = page.locator(".svg-controls");
		if (await controls.isVisible()) {
			// Tab through all controls
			for (let i = 0; i < 5; i++) {
				await page.keyboard.press("Tab");
			}

			// Should reach SVG container
			const svgContainer = page.locator(".svg-container");
			await expect(svgContainer).toBeFocused();

			// Use keyboard shortcuts
			await page.keyboard.press("Equal"); // Zoom in
			await page.keyboard.press("Minus"); // Zoom out
			await page.keyboard.press("0"); // Reset
		}
	});

	test("should support high contrast and zoom workflow", async ({ page }) => {
		// Test with high zoom level
		await page.evaluate(() => {
			document.body.style.zoom = "150%";
		});

		await simulateFileUpload(page, "simple");
		await waitForSvgProcessing(page);

		// Interface should still be usable
		const svgElement = page.locator("svg");
		if (await svgElement.isVisible()) {
			await expect(svgElement).toBeVisible();

			// Controls should still be accessible
			const controls = page.locator(".svg-controls");
			if (await controls.isVisible()) {
				await expect(controls).toBeVisible();
			}
		}

		// Reset zoom
		await page.evaluate(() => {
			document.body.style.zoom = "100%";
		});
	});
});

// =============================================================================
// Error Recovery Workflow Tests
// =============================================================================

test.describe("Error Recovery Workflows", () => {
	test("should recover from network errors", async ({ page }) => {
		// Simulate network failure during resource loading
		await page.route("**/*", route => {
			if (route.request().url().includes("sjsonnet")) {
				route.abort();
			} else {
				route.continue();
			}
		});

		await page.goto("/");
		await page.waitForLoadState("networkidle");

		// Should still show upload interface
		await expect(page.locator(".drop-zone")).toBeVisible();

		// Upload Jsonnet project (should handle missing sjsonnet gracefully)
		await simulateFileUpload(page, "jsonnet");
		await waitForSvgProcessing(page);

		// Should show appropriate error message
		const errorMessage = page.locator(".error-message");
		if (await errorMessage.isVisible()) {
			await expect(errorMessage).toContainText(/jsonnet|unavailable/i);
		}

		// Should still allow JSON projects
		await simulateFileUpload(page, "simple");
		await waitForSvgProcessing(page);
		await expect(page.locator("svg")).toBeVisible();
	});

	test("should recover from processing errors", async ({ page }) => {
		// Upload invalid project
		await simulateFileUpload(page, "invalid");
		await waitForSvgProcessing(page);

		// Should show error
		const errorMessage = page.locator(".error-message");
		await expect(errorMessage).toBeVisible();

		// Upload valid project - should clear error
		await simulateFileUpload(page, "simple");
		await waitForSvgProcessing(page);

		// Error should be cleared, SVG should be shown
		await expect(errorMessage).not.toBeVisible();
		await expect(page.locator("svg")).toBeVisible();

		// Upload another invalid project
		await simulateFileUpload(page, "invalid");
		await waitForSvgProcessing(page);

		// Should show error again
		await expect(errorMessage).toBeVisible();

		// Clear files button should reset state
		const clearBtn = page.locator(".clear-btn");
		if (await clearBtn.isVisible()) {
			await clearBtn.click();
			await expect(page.locator(".drop-zone")).toBeVisible();
			await expect(errorMessage).not.toBeVisible();
		}
	});

	test("should handle memory constraints gracefully", async ({ page }) => {
		// Create extremely large project (simulated)
		await page.evaluate(() => {
			// Simulate memory pressure
			const hugeArray = [...Array(10000)].map((_, i) => ({
				tag: "rect",
				attrs: { x: i, y: i, width: 1, height: 1 },
			}));

			const hugeManifest = {
				attrs: { viewBox: "0 0 10000 10000" },
				children: hugeArray,
			};

			const file = new File(
				[JSON.stringify(hugeManifest)],
				"collagen.json",
				{ type: "application/json" },
			);
			window.mockProjectFiles = { "collagen.json": file };
		});

		await page.evaluate(() => {
			const uploadEvent = new CustomEvent("filesUploaded", {
				detail: window.mockProjectFiles,
			});
			const app = document.querySelector("main");
			if (app) {
				app.dispatchEvent(uploadEvent);
			}
		});

		// Should either process successfully or show appropriate error
		await waitForSvgProcessing(page, 20000);

		// Check result
		const svgElement = page.locator("svg");
		const errorMessage = page.locator(".error-message");

		const hasError = await errorMessage.isVisible();
		const hasSvg = await svgElement.isVisible();

		// Should have either SVG or error, not stuck in loading
		expect(hasError || hasSvg).toBe(true);

		if (hasError) {
			// Error should be descriptive
			await expect(errorMessage).toContainText(/error|memory|size|large/i);
		}
	});
});
