/**
 * Playwright tests for FileList scrolling and undo bar behavior
 */

import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { uploadProject, type ProjectFiles } from "./upload";

function makeManyFilesProject(count: number): ProjectFiles {
	const proj: ProjectFiles = {
		"collagen.json": JSON.stringify({
			attrs: { viewBox: "0 0 100 100" },
			children: [],
		}),
	};
	for (let i = 0; i < count; i++) {
		proj[`file-${i}.txt`] = `content ${i}`;
	}
	return proj;
}

test.describe("FileList Scrolling and Undo Bar", () => {
	test.skip(
		({ browserName }) => browserName !== "chromium",
		"limit to chromium for layout consistency",
	);
	test("file list is scrollable with many files", async ({
		page,
		browserName,
	}) => {
		await page.setViewportSize({ width: 1200, height: 600 });
		await uploadProject(browserName, page, makeManyFilesProject(80));

		const fileList = page.getByRole("region", { name: /file information/i });
		await expect(fileList).toBeVisible();
		const scroller = fileList.locator(".files-container");

		// Force scroll to bottom and verify the scroller moved
		await scroller.evaluate(
			(el: HTMLElement) => (el.scrollTop = el.scrollHeight),
		);
		await page.waitForTimeout(50);
		const lastItem = page.locator(".file-item").last();
		await expect(lastItem).toBeVisible();

		const scrollTop = await scroller.evaluate(
			(el: HTMLElement) => el.scrollTop,
		);
		expect(scrollTop).toBeGreaterThan(0);
	});

	test("undo bar does not cover bottommost item and scroll bounds adjust", async ({
		page,
		browserName,
	}) => {
		await page.setViewportSize({ width: 1200, height: 600 });
		await uploadProject(browserName, page, makeManyFilesProject(80));

		const fileList = page.getByRole("region", { name: /file information/i });
		await expect(fileList).toBeVisible();
		const scroller = fileList.locator(".files-container");

		// Baseline scrollTop before undo bar appears
		const baseScrollTop = await scroller.evaluate(
			(el: HTMLElement) => el.scrollTop,
		);

		// Delete a file to trigger the undo bar (pick a near-top item so the bottom item stays the same)
		const deleteBtn = page.locator(".file-item .delete-button").nth(1);
		await expect(deleteBtn).toBeVisible();
		await deleteBtn.click();

		// Wait for undo bar to appear
		const undoBar = page.locator(".undo-bar");
		await expect(undoBar).toBeVisible();

		// With sticky undo bar, ensure last item is above the bar
		await scroller.evaluate(
			(el: HTMLElement) => (el.scrollTop = el.scrollHeight),
		);
		await page.waitForTimeout(50);
		const [listBox, lastBox, undoBox] = await Promise.all([
			fileList.boundingBox(),
			page.locator(".file-item").last().boundingBox(),
			undoBar.boundingBox(),
		]);
		expect(listBox).not.toBeNull();
		expect(lastBox).not.toBeNull();
		expect(undoBox).not.toBeNull();
		if (lastBox && undoBox) {
			expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(undoBox.y + 1);
		}

		// Wait for undo to auto-dismiss and verify scroll range resets
		await page.waitForTimeout(5600);
		await expect(undoBar).toBeHidden();

		// And we can still scroll to bottom without overlay present
		await scroller.evaluate(
			(el: HTMLElement) => (el.scrollTop = el.scrollHeight),
		);
		const finalScrollTop = await scroller.evaluate(
			(el: HTMLElement) => el.scrollTop,
		);
		expect(finalScrollTop).toBeGreaterThanOrEqual(baseScrollTop);
	});
});

// =============================================================================
// Sidebar Width Stability
// =============================================================================

test.describe("Sidebar Width Stability", () => {
	test.skip(
		({ browserName }) => browserName !== "chromium",
		"limit to chromium for layout consistency",
	);

	test("sidebar width remains constant while files change", async ({
		page,
		browserName,
	}) => {
		await page.setViewportSize({ width: 1200, height: 700 });

		// Start with a decent set of files so the list has content
		const initialProject = makeManyFilesProject(20);
		await uploadProject(browserName, page, initialProject);

		const sidebar = page.locator(".sidebar");
		await expect(sidebar).toBeVisible();

		const widthBefore = await sidebar.evaluate(
			(el: HTMLElement) => el.getBoundingClientRect().width,
		);

		// Delete a file to trigger layout changes (undo bar appears)
		const deleteBtn = page.locator(".file-item .delete-button").first();
		await expect(deleteBtn).toBeVisible();
		await deleteBtn.click();
		await expect(page.locator(".undo-bar")).toBeVisible();

		const widthAfterDelete = await sidebar.evaluate(
			(el: HTMLElement) => el.getBoundingClientRect().width,
		);

		// Add more files to trigger another layout update
		const additionalFiles = {
			"extra-a.txt": "A",
			"extra-b.txt": "B",
			"extra-c.txt": "C",
		};
		await uploadProject(browserName, page, additionalFiles);

		const widthAfterAdd = await sidebar.evaluate(
			(el: HTMLElement) => el.getBoundingClientRect().width,
		);

		// Width should stay fixed at ~25vw with small tolerance for subpixel/zoom differences
		const tol = 2; // px
		expect(Math.abs(widthAfterDelete - widthBefore)).toBeLessThanOrEqual(tol);
		expect(Math.abs(widthAfterAdd - widthBefore)).toBeLessThanOrEqual(tol);
	});

	test("sidebar width remains constant on small viewports", async ({
		page,
		browserName,
	}) => {
		// Force stacked layout via media query (<= 1024px)
		await page.setViewportSize({ width: 480, height: 720 });

		const initialProject = makeManyFilesProject(15);
		await uploadProject(browserName, page, initialProject);

		const sidebar = page.locator(".sidebar");
		await expect(sidebar).toBeVisible();

		const widthBefore = await sidebar.evaluate(
			(el: HTMLElement) => el.getBoundingClientRect().width,
		);

		// Trigger layout changes: delete shows undo bar
		const deleteBtn = page.locator(".file-item .delete-button").first();
		await expect(deleteBtn).toBeVisible();
		await deleteBtn.click();
		await expect(page.locator(".undo-bar")).toBeVisible();

		const widthAfterDelete = await sidebar.evaluate(
			(el: HTMLElement) => el.getBoundingClientRect().width,
		);

		// Add a few files
		const additionalFiles = { "m1.txt": "1", "m2.txt": "2", "m3.txt": "3" };
		await uploadProject(browserName, page, additionalFiles);

		const widthAfterAdd = await sidebar.evaluate(
			(el: HTMLElement) => el.getBoundingClientRect().width,
		);

		// In stacked layout, sidebar should occupy full available width and remain stable
		const tol = 2; // px tolerance
		expect(Math.abs(widthAfterDelete - widthBefore)).toBeLessThanOrEqual(tol);
		expect(Math.abs(widthAfterAdd - widthBefore)).toBeLessThanOrEqual(tol);
	});
});
