/**
 * Comprehensive Playwright tests for FileUploader component
 *
 * Tests both file picker and drag-and-drop functionality with realistic
 * FileSystemEntry mocking, error handling, success cases, and UI state management.
 */

import { expect } from "@playwright/test";
import { test } from "./fixtures";
import {
	type ProjectFiles,
	uploadProject,
	uploadWithFilePicker,
} from "./upload";

// =============================================================================
// Basic FileUploader Interface Tests
// =============================================================================

test.describe("FileUploader Interface", () => {
	test("should display initial upload interface", async ({ page }) => {
		// Check for upload zone with proper accessibility
		const uploadZone = page.getByRole("button", {
			name: /file upload drop zone/i,
		});
		await expect(uploadZone).toBeVisible();
		await expect(uploadZone).toHaveAttribute("aria-label");
		await expect(uploadZone).toHaveAttribute("tabindex", "0");

		// Check for upload instructions
		await expect(
			page.getByRole("heading", { name: /upload collagen project/i }),
		).toBeVisible();
		await expect(page.getByText(/drag and drop/i)).toBeVisible();

		// Check for manifest file references
		await expect(
			page
				.locator("code")
				.filter({ hasText: "collagen.json", hasNotText: "jsonnet" }),
		).toBeVisible();
		await expect(
			page.locator("code").filter({ hasText: "collagen.jsonnet" }),
		).toBeVisible();

		// Check for browse button
		const browseButton = page.getByRole("button", {
			name: /browse for file or folder/i,
		});
		await expect(browseButton).toBeVisible();
		await expect(browseButton).toContainText("Browse");
	});

	test("should respond to keyboard interactions", async ({ page }) => {
		const uploadZone = page.getByRole("button", {
			name: /file upload drop zone/i,
		});

		const input = page.locator("#file-input-hidden");

		// Test tabbing to upload zone
		await page.keyboard.press("Tab");
		await expect(uploadZone).toBeFocused();

		// Test Enter key activation
		await uploadZone.press("Enter");
		await expect(input).not.toBeVisible();
		await uploadZone.press("Escape");

		// Test global 'O' key shortcut
		await page.keyboard.press("o");
		await expect(input).not.toBeVisible();
		await uploadZone.press("Escape");
	});

	test("should show drag over states", async ({ page }) => {
		const uploadZone = page.getByRole("button", {
			name: /file upload drop zone/i,
		});

		// Initial state - no drag over
		await expect(uploadZone).not.toHaveClass(/drag-over/);

		// Wait for Svelte to mount and bind event handlers
		await page.waitForTimeout(500);

		// Simulate drag over (following the same pattern as upload.ts)
		await page.evaluate(() => {
			const dropZone = document.querySelector(".drop-zone") as HTMLElement;
			const dt = new DataTransfer();

			// Dispatch dragenter first (like upload.ts does)
			dropZone.dispatchEvent(
				new DragEvent("dragenter", {
					bubbles: true,
					cancelable: true,
					dataTransfer: dt,
				}),
			);

			// Then dispatch dragover
			dropZone.dispatchEvent(
				new DragEvent("dragover", {
					bubbles: true,
					cancelable: true,
					dataTransfer: dt,
				}),
			);
		});

		// Wait a moment for the reactive class to be applied
		await page.waitForTimeout(50);
		await expect(uploadZone).toHaveClass(/drag-over/);

		// Simulate drag leave
		await page.evaluate(() => {
			const dropZone = document.querySelector(".drop-zone") as HTMLElement;
			const dt = new DataTransfer();
			dropZone.dispatchEvent(
				new DragEvent("dragleave", {
					bubbles: true,
					cancelable: true,
					dataTransfer: dt,
				}),
			);
		});

		await expect(uploadZone).not.toHaveClass(/drag-over/);
	});
});

// FOR CLAUDE
// - Note: Removed pointless innerHTML manipulation tests that don't test actual
//   component behavior
// - Note: Removed pointless error handling tests that just create DOM elements and
//   check for them
// - Note: Removed upload lifecycle tests that manipulate innerHTML instead of testing
//   real behavior
// - Note: Removed SVG display tests that just inject SVG content instead of testing
//   real component behavior

// =============================================================================
// Accessibility and Responsive Design Tests
// =============================================================================

test.describe("Accessibility and Responsive Design", () => {
	test("should maintain accessibility standards", async ({ page }) => {
		const uploadZone = page.getByRole("button", {
			name: /file upload drop zone/i,
		});

		// Check ARIA attributes
		await expect(uploadZone).toHaveAttribute("role", "button");
		await expect(uploadZone).toHaveAttribute("aria-label");
		await expect(uploadZone).toHaveAttribute("tabindex", "0");
		await expect(uploadZone).toHaveAttribute("title");

		// Check keyboard navigation
		await uploadZone.focus();
		await expect(uploadZone).toBeFocused();

		// Check heading hierarchy
		const heading = page.getByRole("heading", { level: 3 });
		await expect(heading).toContainText("Upload Collagen Project");
	});

	test("should work on different screen sizes", async ({ page }) => {
		const uploadZone = page.getByRole("button", {
			name: /file upload drop zone/i,
		});

		// Test desktop
		await page.setViewportSize({ width: 1200, height: 800 });
		await expect(uploadZone).toBeVisible();
		const desktopBox = await uploadZone.boundingBox();
		expect(desktopBox?.width).toBeGreaterThan(400);

		// Test tablet
		await page.setViewportSize({ width: 768, height: 1024 });
		await expect(uploadZone).toBeVisible();

		// Test mobile
		await page.setViewportSize({ width: 375, height: 667 });
		await expect(uploadZone).toBeVisible();
		const mobileBox = await uploadZone.boundingBox();
		expect(mobileBox?.height).toBeGreaterThan(80);
	});

	test("should display disabled state correctly", async ({ page }) => {
		// Simulate disabled state
		await page.evaluate(() => {
			const uploadZone = document.querySelector(".drop-zone");
			if (uploadZone) {
				uploadZone.classList.add("disabled");
			}
		});

		const uploadZone = page.getByRole("button", {
			name: /file upload drop zone/i,
		});
		await expect(uploadZone).toHaveCSS("opacity", "0.5");
		await expect(uploadZone).toHaveCSS("cursor", "not-allowed");
	});
});

// =============================================================================
// Realistic Upload Integration Tests
// =============================================================================

test.describe("Realistic Upload Integration", () => {
	test("should handle single JSON file upload", async ({ page }) => {
		await uploadWithFilePicker(page, "simpleJson");

		// Should show the file list indicating successful upload
		await expect(
			page.getByRole("region", { name: /file information/i }),
		).toBeVisible();

		// Should show the generated SVG
		await expect(page.getByLabel("Interactive SVG viewer")).toBeVisible({
			timeout: 5000,
		});

		// After initial upload, the file list becomes the drop zone
		await expect(
			page.getByRole("region", { name: /file information/i }),
		).toBeVisible();
		await expect(page.getByText(/drop files here/i)).toBeVisible();
	});

	test("should handle single folder upload", async ({ page, browserName }) => {
		await uploadProject(browserName, page, "folderWithAssets");

		// So this is an issue with how we mock. Since we don't actually have the ability
		// to drop a folder onto the drop zone in test -- we can only drop mulitple files
		// with the same root path -- we have to compromise and check for the file list
		// and SVG as success indicators
		await expect(
			page.getByRole("region", { name: /file information/i }),
		).toBeVisible();
		await expect(page.getByLabel("Interactive SVG viewer")).toBeVisible({
			timeout: 5000,
		});
	});

	test("should show error for missing manifest file", async ({ page }) => {
		await uploadWithFilePicker(page, "noManifest");

		await page.waitForTimeout(1000);

		// Should show error message about missing manifest
		const errorMessage = page.locator(".error-message");
		await expect(errorMessage).toBeVisible();

		// Check for manifest-related error text (the exact message may vary)
		const hasManifestError =
			(await errorMessage
				.locator("text=/manifest|collagen\\.json|collagen\\.jsonnet/i")
				.count()) > 0;
		expect(hasManifestError).toBeTruthy();
	});

	test("should handle multiple files correctly", async ({ page }) => {
		await uploadWithFilePicker(page, "multipleFilesValid");

		await page.waitForTimeout(1000);

		// Should show file list and SVG for multiple files
		await expect(
			page.getByRole("region", { name: /file information/i }),
		).toBeVisible();
		await expect(page.getByLabel("Interactive SVG viewer")).toBeVisible({
			timeout: 5000,
		});
	});
});

// =============================================================================
// Edge Cases and Robustness Tests
// =============================================================================

test.describe("Edge Cases and Robustness", () => {
	test("should handle rapid successive upload attempts", async ({ page }) => {
		// Simulate multiple rapid clicks on browse button
		const browseButton = page.getByRole("button", {
			name: /browse for file or folder/i,
		});

		// Click multiple times rapidly
		await browseButton.click();
		await browseButton.click();
		await browseButton.click();

		// Should not break the interface
		await expect(browseButton).toBeVisible();
		await expect(
			page.getByRole("heading", { name: /upload collagen project/i }),
		).toBeVisible();
	});

	test("should handle disabled state correctly", async ({ page }) => {
		// Simulate component being disabled
		await page.evaluate(() => {
			const uploadZone = document.querySelector(".drop-zone");
			const browseButton = document.querySelector(".browse-btn");
			if (uploadZone && browseButton) {
				uploadZone.classList.add("disabled");
				(browseButton as HTMLButtonElement).disabled = true;
			}
		});

		const uploadZone = page.getByRole("button", {
			name: /file upload drop zone/i,
		});
		const browseButton = page.getByRole("button", {
			name: /browse for file or folder/i,
		});

		// Should show disabled styling
		await expect(uploadZone).toHaveClass(/disabled/);
		await expect(browseButton).toBeDisabled();

		// Should not respond to interactions when disabled
		await browseButton.click({ force: true }); // Force click even when disabled
		// Interface should remain in disabled state
		await expect(uploadZone).toHaveClass(/disabled/);
	});

	test("should handle keyboard accessibility properly", async ({ page }) => {
		const uploadZone = page.getByRole("button", {
			name: /file upload drop zone/i,
		});

		// Tab to upload zone
		await page.keyboard.press("Tab");
		await expect(uploadZone).toBeFocused();

		// Enter should activate
		await page.keyboard.press("Enter");
		// Should maintain focus and functionality
		await expect(uploadZone).toBeFocused();

		// Space should also activate
		await page.keyboard.press("Space");
		await expect(uploadZone).toBeFocused();

		// Global 'O' shortcut should work
		await page.keyboard.press("o");
		// Should maintain interface state
		await expect(uploadZone).toBeVisible();
	});

	test("should handle very large file names and paths", async ({ page }) => {
		// Test with extremely long file names
		const longFileName = "a".repeat(200) + ".json";
		const projectData = {
			[longFileName]: JSON.stringify({
				attrs: { viewBox: "0 0 100 100" },
				children: [],
			}),
			"collagen.json": JSON.stringify({}),
		};

		await uploadWithFilePicker(page, projectData);

		// Verify successful upload by checking for file list and SVG
		await expect(
			page.getByRole("region", { name: /file information/i }),
		).toBeVisible();
		await expect(page.getByLabel("Interactive SVG viewer")).toBeVisible({
			timeout: 5000,
		});
	});

	test("should handle empty files gracefully", async ({ page }) => {
		// Create a test project with empty JSON file
		const emptyFileProject = "malformedJson"; // This has invalid JSON which will trigger an error

		await uploadWithFilePicker(page, emptyFileProject);

		await page.waitForTimeout(1000);

		// Should show appropriate error for empty/invalid JSON
		const errorMessage = page.locator(".error-message");
		await expect(errorMessage).toBeVisible();
	});
});

// =============================================================================
// Performance and Stress Tests
// =============================================================================

test.describe("Performance and Stress Tests", () => {
	test("should handle moderately large number of files", async ({
		page,
		browserName,
	}) => {
		// Create project with many files
		const manyFilesProject: ProjectFiles = {
			"collagen.json": JSON.stringify({
				attrs: { viewBox: "0 0 100 100" },
				children: [],
			}),
		};

		// Add 50 additional files
		for (let i = 0; i < 50; i++) {
			manyFilesProject[`file${i}.txt`] = `Content of file ${i}`;
		}

		// Click the browse button to trigger file picker
		await page
			.getByRole("button", { name: /browse for file or folder/i })
			.click();

		// Test using DOM-based approach with timing
		const startTime = performance.now();

		await uploadProject(browserName, page, manyFilesProject);

		const endTime = performance.now();
		const duration = endTime - startTime;

		// Should complete within reasonable time (less than 5 seconds)
		expect(duration).toBeLessThan(5000);

		// Should show file list and SVG as success indicators
		await expect(
			page.getByRole("region", { name: /file information/i }),
		).toBeVisible();
		await expect(page.getByLabel("Interactive SVG viewer")).toBeVisible();
	});

	test("should handle deep folder structures", async ({
		page,
		browserName,
	}) => {
		// Create deeply nested folder structure - use drag and drop for folder upload
		const deepFolderProject: ProjectFiles = {
			"project/level1/level2/level3/level4/level5/collagen.json":
				JSON.stringify({
					attrs: { viewBox: "0 0 100 100" },
					children: { image_path: "assets/deep.png" },
				}),
			"project/level1/level2/level3/level4/level5/assets/deep.png":
				"Fake image data",
		};

		// Use drag and drop which better supports folder structures
		await uploadProject(browserName, page, deepFolderProject); // Use existing folder project

		// Check for successful upload indicators
		await expect(
			page.getByRole("region", { name: /file information/i }),
		).toBeVisible();
		await expect(page.getByLabel("SVG content")).toBeVisible();

		const svg = page.getByLabel("SVG content").locator("svg");
		expect(await svg.getAttribute("viewBox")).toBe("0 0 100 100");
	});
});
