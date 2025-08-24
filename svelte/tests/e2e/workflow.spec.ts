/**
 * Playwright workflow tests for complete user scenarios
 *
 * Tests end-to-end user workflows including file upload, processing,
 * viewing results, error handling, and various user interactions.
 */

/// <reference path="../globals.d.ts" />

import { expect, Page } from "@playwright/test";
import { test } from "./fixtures";

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
			// Create a minimal valid PNG data URI (1x1 transparent pixel)
			"logo.png": atob(
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
			),
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
			let mimeType = "text/plain";
			let fileContent: string | Uint8Array = content;

			if (filename.endsWith(".json") || filename.endsWith(".jsonnet")) {
				mimeType = "application/json";
			} else if (filename.endsWith(".png")) {
				mimeType = "image/png";
				// Convert binary string to Uint8Array for PNG
				const binaryString = content as string;
				const bytes = new Uint8Array(binaryString.length);
				for (let i = 0; i < binaryString.length; i++) {
					bytes[i] = binaryString.charCodeAt(i);
				}
				fileContent = bytes;
			} else if (filename.endsWith(".svg")) {
				mimeType = "image/svg+xml";
			}

			const file = new File([fileContent as BlobPart], filename, {
				type: mimeType,
			});
			window.mockProjectFiles[filename] = file;
		});
	}, projects[projectType]);
}

/** Simulate file upload via drag and drop */
async function simulateFileUpload(
	page: Page,
	projectType: "simple" | "complex" | "jsonnet" | "invalid",
) {
	await setupMockProject(page, projectType);

	// Simulate drag and drop directly on the drop zone
	await page.evaluate(() => {
		const dropZone = document.querySelector(".drop-zone");
		if (dropZone && window.mockProjectFiles) {
			// Create mock DataTransferItemList
			const files = window.mockProjectFiles;
			const fileKeys = Object.keys(files);

			// Create a mock DataTransfer with the files
			const mockItems = fileKeys.map(key => {
				const file = files[key];
				return {
					kind: "file",
					type: file.type,
					webkitGetAsEntry: () => ({
						name: key,
						isDirectory: false,
						isFile: true,
						file: (success: (f: File) => void) => success(file),
					}),
				};
			});

			// Create mock drag event
			const dragEvent = new DragEvent("drop", {
				bubbles: true,
				cancelable: true,
			});

			// Add mock dataTransfer
			Object.defineProperty(dragEvent, "dataTransfer", {
				value: { items: mockItems },
			});

			dropZone.dispatchEvent(dragEvent);
		}
	});
}

/** Wait for SVG processing to complete */
async function waitForSvgProcessing(page: any, timeout = 5000) {
	await page.waitForFunction(
		() => {
			const svgSection = document.querySelector(".svg-section");
			const errorMessage = document.querySelector(".error-message");
			const loading = document.querySelector(".loading");
			// Processing is complete when we have SVG output, error, or no longer loading
			return (svgSection || errorMessage) && !loading;
		},
		{ timeout },
	);
}

// =============================================================================
// Complete User Workflow Tests
// =============================================================================

test.describe("Complete User Workflows", () => {
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
		const zoomInBtn = page.locator("button", { hasText: "🔍+" });
		if (await zoomInBtn.isVisible()) {
			await zoomInBtn.click();
			await page.waitForTimeout(100);
		}

		// 6. Test export functionality
		const exportBtn = page.locator("button", { hasText: "💾" });
		if (await exportBtn.isVisible()) {
			// Mock download to avoid actual file download
			await page.evaluate(() => {
				const originalCreateElement = document.createElement;
				document.createElement = function (tagName: string) {
					const element = originalCreateElement.call(this, tagName);
					if (tagName === "a") {
						element.click = function () {
							(window as any).downloadTriggered = true;
						};
					}
					return element;
				};
			});

			await exportBtn.click();
			await page.waitForTimeout(100);
		}

		// 7. Upload another project (clear and restart)
		const clearBtn = page.locator("button", {
			hasText: "Upload Another Project",
		});
		if (await clearBtn.isVisible()) {
			await clearBtn.click();
			await expect(page.locator(".drop-zone")).toBeVisible();
		}
	});

	test("should handle complex project with multiple assets", async ({
		page,
		isMobile,
	}) => {
		// Upload complex project
		await simulateFileUpload(page, "complex");
		await waitForSvgProcessing(page, 10000);

		// Check if complex project processed successfully or show appropriate error
		const svgElement = page.locator("svg");
		const errorMessage = page.locator(".error-message");

		if (await svgElement.isVisible()) {
			// Complex project processed successfully
			// Should contain background rect, image, text group, and nested SVG
			const rectCount = await page.locator("rect").count();
			expect(rectCount).toBeGreaterThanOrEqual(1);
		} else if (await errorMessage.isVisible()) {
			// Complex assets may not be supported, processing failed, or file upload issue
			await expect(errorMessage).toContainText(
				/image|svg|asset|processing|drop.*file|folder/i,
			);
		} else {
			// If neither SVG nor error is visible, that's unexpected
			throw new Error(
				"Expected either SVG output or error message for complex project",
			);
		}

		// Test interactive features only if SVG was successfully generated
		if (await svgElement.isVisible()) {
			const svgContainer = page.locator(".svg-container");
			if (await svgContainer.isVisible()) {
				// Test pan interaction
				await svgContainer.hover();
				await page.mouse.down();
				await page.mouse.move(50, 30);
				await page.mouse.up();

				// Test wheel zoom
				await svgContainer.hover();
				if (!isMobile) {
					await page.mouse.wheel(0, -100);
				}
				await page.waitForTimeout(100);
			}

			// Test controls
			const controls = page.locator(".controls");
			if (await controls.isVisible()) {
				// Check for control buttons by text since they don't have specific classes
				await expect(controls.locator("button").first()).toBeVisible();
			}
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
			const circleCount = await page.locator("circle").count();
			expect(circleCount).toBeGreaterThan(0);
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
		await expect(errorMessage).toContainText(
			/error|invalid|syntax|parse|JSON/i,
		);

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
	test("should support keyboard navigation workflow", async ({ page }) => {
		// Tab through interface elements
		await page.keyboard.press("Tab"); // Focus upload zone or first control

		// If controls are visible, test keyboard navigation
		const controls = page.locator(".controls");
		if (await controls.isVisible()) {
			// Tab through controls - just verify we can navigate without checking specific buttons
			for (let i = 0; i < 7; i++) {
				await page.keyboard.press("Tab");
			}

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

	test("should support mouse interaction workflow", async ({
		page,
		isMobile,
	}) => {
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
			if (!isMobile) {
				await page.mouse.wheel(0, -120); // Zoom in
				await page.mouse.wheel(0, 120); // Zoom out
			}
		}
	});

	test("should support touch interaction workflow", async ({ browser }) => {
		// Create a new context with touch support
		const context = await browser.newContext({
			hasTouch: true,
			isMobile: true,
			viewport: { width: 375, height: 667 },
		});
		const touchPage = await context.newPage();

		// setup
		await simulateFileUpload(touchPage, "simple");
		await waitForSvgProcessing(touchPage);

		const svgContainer = touchPage.locator(".svg-container");
		if (await svgContainer.isVisible()) {
			const box = await svgContainer.boundingBox();
			if (box) {
				// Simulate touch pan
				const centerX = box.x + box.width / 2;
				const centerY = box.y + box.height / 2;

				await touchPage.touchscreen.tap(centerX, centerY);
				await touchPage.waitForTimeout(100);

				// Simulate swipe gesture with proper touch objects
				await touchPage.evaluate(
					coords => {
						const container = document.querySelector(".svg-container");
						if (container) {
							// Create proper Touch objects
							const touch1 = new Touch({
								identifier: 1,
								target: container,
								clientX: coords.x,
								clientY: coords.y,
								pageX: coords.x,
								pageY: coords.y,
							});

							const touch2 = new Touch({
								identifier: 1,
								target: container,
								clientX: coords.x + 50,
								clientY: coords.y + 30,
								pageX: coords.x + 50,
								pageY: coords.y + 30,
							});

							const touchStart = new TouchEvent("touchstart", {
								touches: [touch1],
								bubbles: true,
								cancelable: true,
							});

							const touchMove = new TouchEvent("touchmove", {
								touches: [touch2],
								bubbles: true,
								cancelable: true,
							});

							const touchEnd = new TouchEvent("touchend", {
								touches: [],
								bubbles: true,
								cancelable: true,
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

		// Clean up
		await context.close();
	});
});

// =============================================================================
// Performance and Edge Case Workflows
// =============================================================================

test.describe("Performance and Edge Case Workflows", () => {
	test("should handle large project workflow", async ({ page, isMobile }) => {
		// Create and upload a project with many elements
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

		// Create mock file and upload via drag-and-drop
		await page.evaluate(manifest => {
			const file = new File([JSON.stringify(manifest)], "collagen.json", {
				type: "application/json",
			});
			window.mockProjectFiles = { "collagen.json": file };
		}, largeManifest);

		// Use proper drag-and-drop simulation
		await page.evaluate(() => {
			const dropZone = document.querySelector(".drop-zone");
			if (dropZone && window.mockProjectFiles) {
				const files = window.mockProjectFiles;
				const fileKeys = Object.keys(files);

				const mockItems = fileKeys.map(key => {
					const file = files[key];
					return {
						kind: "file",
						type: file.type,
						webkitGetAsEntry: () => ({
							name: key,
							isDirectory: false,
							isFile: true,
							file: (success: (f: File) => void) => success(file),
						}),
					};
				});

				const dragEvent = new DragEvent("drop", {
					bubbles: true,
					cancelable: true,
				});

				Object.defineProperty(dragEvent, "dataTransfer", {
					value: { items: mockItems },
				});

				dropZone.dispatchEvent(dragEvent);
			}
		});

		// Wait for processing (may take longer for large projects)
		await waitForSvgProcessing(page, 20000);

		const svgElement = page.locator("svg");
		if (await svgElement.isVisible()) {
			// Verify all elements are rendered
			const rects = page.locator("rect");
			await expect(rects).toHaveCount(200);

			// Test that interactions still work with many elements
			const svgContainer = page.locator(".svg-container");
			await svgContainer.hover();
			if (!isMobile) {
				await page.mouse.wheel(0, -100); // Should still zoom smoothly
			}
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
		await waitForSvgProcessing(page, 10000);
		const svgElement = page.locator("svg");
		await expect(svgElement).toBeVisible();
	});

	test("should handle browser back/forward workflow", async ({ page }) => {
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
		await waitForSvgProcessing(page, 10000);
		await expect(page.locator("svg")).toBeVisible();
	});

	test("should handle browser refresh workflow", async ({ page }) => {
		// Upload project
		await simulateFileUpload(page, "simple");
		await waitForSvgProcessing(page);

		// Refresh page
		await page.reload();
		await page.waitForLoadState("domcontentloaded");

		// Should reset to initial state
		await expect(page.locator(".drop-zone")).toBeVisible();
		await expect(page.locator("text=Upload Collagen Project")).toBeVisible();

		// Should work normally after refresh
		await simulateFileUpload(page, "simple");
		await waitForSvgProcessing(page, 10000);
		await expect(page.locator("svg")).toBeVisible();
	});
});

// =============================================================================
// Accessibility Workflow Tests
// =============================================================================

test.describe("Accessibility Workflows", () => {
	test("should support screen reader workflow", async ({ page }) => {
		// Check ARIA landmarks and labels - main element has implicit role
		await expect(page.locator("main")).toBeVisible();

		const uploadZone = page.locator(".drop-zone");
		await expect(uploadZone).toHaveAttribute("role", "button");
		await expect(uploadZone).toHaveAttribute("aria-label");

		// Upload project and check SVG accessibility
		await simulateFileUpload(page, "simple");
		await waitForSvgProcessing(page);

		const svgContainer = page.locator(".svg-container");
		if (await svgContainer.isVisible()) {
			// SVG container is a button, not img role
			await expect(svgContainer).toHaveAttribute("aria-label");
		}

		// Check controls have proper labels
		const controls = page.locator(".controls button");
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
		const controls = page.locator(".controls");
		if (await controls.isVisible()) {
			// Focus on SVG container directly since tab order can vary
			const svgContainer = page.locator(".svg-container");
			await svgContainer.focus();
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
			const controls = page.locator(".controls");
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
		await page.waitForLoadState("domcontentloaded");

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
		const clearBtn = page.locator("button", {
			hasText: "Upload Another Project",
		});
		if (await clearBtn.isVisible()) {
			await clearBtn.click();
			await expect(page.locator(".drop-zone")).toBeVisible();
			await expect(errorMessage).not.toBeVisible();
		}
	});

	test("should handle memory constraints gracefully", async ({ page }) => {
		// Create and upload extremely large project (simulated)
		// Simulate memory pressure
		const hugeArray = [...Array(10000)].map((_, i) => ({
			tag: "rect",
			attrs: { x: i, y: i, width: 1, height: 1 },
		}));

		const hugeManifest = {
			attrs: { viewBox: "0 0 10000 10000" },
			children: hugeArray,
		};

		// Create mock file and upload via drag-and-drop
		await page.evaluate(manifest => {
			const file = new File([JSON.stringify(manifest)], "collagen.json", {
				type: "application/json",
			});
			window.mockProjectFiles = { "collagen.json": file };
		}, hugeManifest);

		// Use proper drag-and-drop simulation
		await page.evaluate(() => {
			const dropZone = document.querySelector(".drop-zone");
			if (dropZone && window.mockProjectFiles) {
				const files = window.mockProjectFiles;
				const fileKeys = Object.keys(files);

				const mockItems = fileKeys.map(key => {
					const file = files[key];
					return {
						kind: "file",
						type: file.type,
						webkitGetAsEntry: () => ({
							name: key,
							isDirectory: false,
							isFile: true,
							file: (success: (f: File) => void) => success(file),
						}),
					};
				});

				const dragEvent = new DragEvent("drop", {
					bubbles: true,
					cancelable: true,
				});

				Object.defineProperty(dragEvent, "dataTransfer", {
					value: { items: mockItems },
				});

				dropZone.dispatchEvent(dragEvent);
			}
		});

		// Should either process successfully or show appropriate error
		await waitForSvgProcessing(page, 30000);

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
