/**
 * End-to-end tests focused on the in-app text editor
 */

import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { uploadProject } from "./upload";

async function getViewportWidth(page: import("@playwright/test").Page) {
	const size = page.viewportSize();
	if (!size) return 1200;
	return size.width;
}

test.describe("Text Editor", () => {
	test.beforeEach(async ({ page, browserName }) => {
		await uploadProject(browserName, page, "simpleJson");
		await expect(
			page.getByRole("region", { name: /file information/i }),
		).toBeVisible();
	});

	test("opens on text file click and shows compact SVG without controls", async ({
		page,
	}) => {
		// Open editor by clicking the text file row
		await page.getByRole("button", { name: /edit collagen\.json/i }).click();

		// Editor should be visible
		const editor = page.getByRole("region", { name: /text editor/i });
		await expect(editor).toBeVisible();
		await expect(
			editor.getByRole("button", { name: /close editor/i }),
		).toBeVisible();
		await expect(editor.locator("textarea.editor-textarea")).toBeVisible();

		// Compact SVG should be visible below the file list, no controls visible
		const compact = page.getByRole("region", {
			name: /generated svg display \(compact\)/i,
		});
		await expect(compact).toBeVisible();
		await expect(
			page.getByRole("toolbar", { name: /svg viewer controls/i }),
		).toHaveCount(0);
	});

	test("keyboard activation on file row (Enter/Space)", async ({ page }) => {
		const rowBtn = page.getByRole("button", { name: /edit collagen\.json/i });
		await rowBtn.focus();
		await expect(rowBtn).toBeFocused();

		await page.keyboard.press("Enter");
		await expect(
			page.getByRole("region", { name: /text editor/i }),
		).toBeVisible();

		// Close and try Space (reopen)
		await page.getByRole("button", { name: /close editor/i }).click();
		await rowBtn.focus();
		await page.keyboard.press(" ");
		await expect(
			page.getByRole("region", { name: /text editor/i }),
		).toBeVisible();
	});

	test("layout widens sidebar and splits heights while editing, restores on close", async ({
		page,
	}) => {
		await page.getByRole("button", { name: /edit collagen\.json/i }).click();

		const sidebar = page.locator(".sidebar");
		const top = page.locator(".sidebar-top");
		const bottom = page.locator(".sidebar-bottom.compact-svg");

		const viewportW = await getViewportWidth(page);
		const sidebarBox = await sidebar.boundingBox();
		expect(sidebarBox).not.toBeNull();
		const sidebarW = sidebarBox!.width;
		// 35vw ± 30px tolerance
		expect(Math.abs(sidebarW - 0.35 * viewportW)).toBeLessThanOrEqual(30);

		const topBox = await top.boundingBox();
		const bottomBox = await bottom.boundingBox();
		expect(topBox).not.toBeNull();
		expect(bottomBox).not.toBeNull();
		const diff = Math.abs((topBox!.height ?? 0) - (bottomBox!.height ?? 0));
		expect(diff).toBeLessThanOrEqual(30);

		// Close editor and check sidebar returns to ~25vw
		await page.getByRole("button", { name: /close editor/i }).click();
		const sidebarBox2 = await sidebar.boundingBox();
		expect(sidebarBox2).not.toBeNull();
		const sidebarW2 = sidebarBox2!.width;
		expect(Math.abs(sidebarW2 - 0.25 * viewportW)).toBeLessThanOrEqual(30);
	});

	test("debounced persistence updates compact SVG without control flicker", async ({
		page,
	}) => {
		await page.getByRole("button", { name: /edit collagen\.json/i }).click();
		const textarea = page.locator("textarea.editor-textarea");

		// Verify initial color (blue)
		const compact = page.getByRole("region", {
			name: /generated svg display \(compact\)/i,
		});
		const rect = compact.locator("svg rect");
		await expect(rect).toBeVisible();
		await expect(rect).toHaveAttribute("fill", "blue");

		// Replace manifest to change fill to green
		const newManifest = JSON.stringify(
			{
				attrs: { viewBox: "0 0 100 100" },
				children: [
					{
						tag: "rect",
						attrs: { x: 0, y: 0, width: 50, height: 50, fill: "green" },
					},
				],
			},
			null,
			2,
		);

		await textarea.fill(newManifest);

		// Immediately after typing, it should still be old color (debounce ~200ms)
		await page.waitForTimeout(100);
		await expect(rect).toHaveAttribute("fill", "blue");

		// After debounce window, it should update
		await page.waitForTimeout(300);
		await expect(rect).toHaveAttribute("fill", "green");

		// Ensure no controls are present (no flicker to full controls)
		await expect(
			page.getByRole("toolbar", { name: /svg viewer controls/i }),
		).toHaveCount(0);
	});

	test("invalid JSON shows compact error without waiting-state flicker, then recovers", async ({
		page,
	}) => {
		await page.getByRole("button", { name: /edit collagen\.json/i }).click();
		const textarea = page.locator("textarea.editor-textarea");
		const compact = page.getByRole("region", {
			name: /generated svg display \(compact\)/i,
		});

		// Break the JSON
		await textarea.fill("{");
		await page.waitForTimeout(300);

		const errorRegion = compact.locator(".error-state, [role=alert]").first();
		await expect(errorRegion).toBeVisible();
		// Waiting state should not replace error once error is present
		await expect(compact.locator(".waiting-state")).toHaveCount(0);

		// Fix JSON
		const fixedManifest = JSON.stringify(
			{
				attrs: { viewBox: "0 0 100 100" },
				children: [
					{
						tag: "rect",
						attrs: { x: 0, y: 0, width: 50, height: 50, fill: "red" },
					},
				],
			},
			null,
			2,
		);
		await textarea.fill(fixedManifest);
		await page.waitForTimeout(300);

		// Error should be gone and SVG visible again
		await expect(errorRegion).toBeHidden();
		await expect(compact.locator("svg rect")).toHaveAttribute("fill", "red");
	});

	test("closing editor restores main viewer and its controls", async ({
		page,
	}) => {
		await page.getByRole("button", { name: /edit collagen\.json/i }).click();
		await page.getByRole("button", { name: /close editor/i }).click();

		// Main viewer and its controls return
		await expect(page.getByLabel("Interactive SVG viewer")).toBeVisible();
		await expect(
			page.getByRole("toolbar", { name: /svg viewer controls/i }),
		).toBeVisible();

		// Compact viewer disappears
		await expect(
			page.getByRole("region", {
				name: /generated svg display \(compact\)/i,
			}),
		).toHaveCount(0);
	});
});
