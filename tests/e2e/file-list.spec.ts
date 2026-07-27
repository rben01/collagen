/**
 * Playwright tests for the FileList panel: scrolling, the undo bar, dropping
 * files onto it, and sidebar layout stability.
 */

import { expect } from "@playwright/test";
import { test } from "./fixtures";
import {
	hoverDragOverFileList,
	uploadMoreToFileList,
	uploadProject,
	type ProjectFiles,
} from "./upload";
import { fileListRegion } from "./helpers";

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

/**
 * Scroll a container to the bottom and wait for it to land there.
 * `.files-container` sets `scroll-behavior: smooth`, so a plain `scrollTop`
 * assignment animates and reads back as 0 if sampled immediately.
 */
async function scrollToBottom(scroller: import("@playwright/test").Locator) {
	await scroller.evaluate((el: HTMLElement) =>
		el.scrollTo({ top: el.scrollHeight, behavior: "instant" }),
	);
	await expect
		.poll(async () =>
			scroller.evaluate(
				(el: HTMLElement) =>
					el.scrollHeight - el.clientHeight - el.scrollTop,
			),
		)
		.toBeLessThanOrEqual(1);
}

/** The file count the panel reports in its heading. */
async function reportedFileCount(page: import("@playwright/test").Page) {
	const text = await fileListRegion(page)
		.getByRole("heading", { level: 3 })
		.innerText();
	return Number(text.match(/Files \((\d+)\)/)?.[1] ?? -1);
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

		const fileList = fileListRegion(page);
		await expect(fileList).toBeVisible();
		expect(await reportedFileCount(page)).toBe(81);

		const scroller = fileList.locator(".files-container");

		// The container must actually overflow, otherwise this proves nothing
		const { scrollHeight, clientHeight } = await scroller.evaluate(
			(el: HTMLElement) => ({
				scrollHeight: el.scrollHeight,
				clientHeight: el.clientHeight,
			}),
		);
		expect(scrollHeight).toBeGreaterThan(clientHeight);

		await scrollToBottom(scroller);

		const lastItem = page.locator(".file-item").last();
		await expect(lastItem).toBeVisible();
		expect(
			await scroller.evaluate((el: HTMLElement) => el.scrollTop),
		).toBeGreaterThan(0);
	});

	test("undo bar does not cover bottommost item and scroll bounds adjust", async ({
		page,
		browserName,
	}) => {
		await page.setViewportSize({ width: 1200, height: 600 });
		await uploadProject(browserName, page, makeManyFilesProject(80));

		const fileList = fileListRegion(page);
		const scroller = fileList.locator(".files-container");

		const baseScrollTop = await scroller.evaluate(
			(el: HTMLElement) => el.scrollTop,
		);

		// Delete a near-top file so the bottom item stays the same
		const targetRow = page.locator(".file-item").nth(1);
		const targetName = await targetRow.locator(".file-path").innerText();
		await targetRow.locator(".delete-button").click();

		const undoBar = page.locator(".undo-bar");
		await expect(undoBar).toBeVisible();
		await expect(undoBar).toContainText("Removed 1 file");
		expect(await reportedFileCount(page)).toBe(80);

		// With the undo bar shown, the last item must remain fully above it
		await scrollToBottom(scroller);
		const [lastBox, undoBox] = await Promise.all([
			page.locator(".file-item").last().boundingBox(),
			undoBar.boundingBox(),
		]);
		expect(lastBox).not.toBeNull();
		expect(undoBox).not.toBeNull();
		expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(undoBox!.y + 1);

		// Undo restores the deleted file
		await page.getByRole("button", { name: /^Undo/ }).click();
		await expect(undoBar).toHaveCount(0);
		expect(await reportedFileCount(page)).toBe(81);
		await expect(
			fileList.getByText(targetName, { exact: true }),
		).toBeVisible();

		// And we can still scroll to the bottom with no overlay present
		await scrollToBottom(scroller);
		expect(
			await scroller.evaluate((el: HTMLElement) => el.scrollTop),
		).toBeGreaterThanOrEqual(baseScrollTop);
	});

	test("the undo bar auto-dismisses and the deletion becomes permanent", async ({
		page,
		browserName,
	}) => {
		await page.setViewportSize({ width: 1200, height: 600 });
		await uploadProject(browserName, page, makeManyFilesProject(5));

		const targetRow = page.locator(".file-item").nth(1);
		const targetName = await targetRow.locator(".file-path").innerText();
		await targetRow.locator(".delete-button").click();

		const undoBar = page.locator(".undo-bar");
		await expect(undoBar).toBeVisible();

		// TRASH_UNDO_TIME is 5s
		await expect(undoBar).toHaveCount(0, { timeout: 8000 });
		expect(await reportedFileCount(page)).toBe(5);
		await expect(
			fileListRegion(page).getByText(targetName, { exact: true }),
		).toHaveCount(0);
	});
});

// =============================================================================
// Drop on FileList After Initial Upload
// =============================================================================

test.describe("Post-upload FileList Drop", () => {
	test.skip(
		({ browserName }) => browserName !== "chromium",
		"drag-and-drop folder upload is chromium-only in tests",
	);

	test("dropping files on file list adds them", async ({
		page,
		browserName,
	}) => {
		await page.setViewportSize({ width: 1200, height: 700 });
		await uploadProject(browserName, page, makeManyFilesProject(5));

		const fileList = fileListRegion(page);
		const countBefore = await reportedFileCount(page);

		await uploadMoreToFileList(page, {
			"extra-1.txt": "1",
			"folder/extra-2.txt": "2",
		});

		expect(await reportedFileCount(page)).toBe(countBefore + 2);
		await expect(
			fileList.getByText("extra-1.txt", { exact: true }),
		).toBeVisible();
		await expect(
			fileList.getByText("folder/extra-2.txt", { exact: true }),
		).toBeVisible();
	});

	test("file list shows a drag-over state", async ({ page, browserName }) => {
		await page.setViewportSize({ width: 1200, height: 700 });
		await uploadProject(browserName, page, makeManyFilesProject(5));

		const panel = page.locator(".file-list");
		await expect(panel).not.toHaveClass(/drag-over/);

		await hoverDragOverFileList(page, false);
		await expect(panel).toHaveClass(/drag-over/);

		await hoverDragOverFileList(page, true);
		await expect(panel).not.toHaveClass(/drag-over/);
	});

	test("the drop target's description is reachable by assistive tech", async ({
		page,
	}) => {
		// FileList sets aria-describedby="file-list-hint", but nothing in the
		// document has that id: the guidance text lives in
		// `.file-list-bottom-hint`, which has no id and is aria-hidden. The
		// reference therefore dangles and screen readers announce no description.
		// Fix: give that div `id="file-list-hint"` and drop `aria-hidden="true"`.
		const fileList = fileListRegion(page);
		await expect(fileList).toHaveAttribute(
			"aria-describedby",
			"file-list-hint",
		);
		await expect(page.locator("#file-list-hint")).toHaveCount(1);
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

	const tolerancePx = 2;

	test("sidebar width remains constant while files change", async ({
		page,
		browserName,
	}) => {
		await page.setViewportSize({ width: 1200, height: 700 });
		await uploadProject(browserName, page, makeManyFilesProject(20));

		const sidebar = page.locator(".sidebar");
		await expect(sidebar).toBeVisible();

		const widthOf = () =>
			sidebar.evaluate(
				(el: HTMLElement) => el.getBoundingClientRect().width,
			);
		const widthBefore = await widthOf();

		// Deleting shows the undo bar, which changes the panel's height
		await page.locator(".file-item .delete-button").first().click();
		await expect(page.locator(".undo-bar")).toBeVisible();
		expect(Math.abs((await widthOf()) - widthBefore)).toBeLessThanOrEqual(
			tolerancePx,
		);

		// Adding files grows the list
		await uploadProject(browserName, page, {
			"extra-a.txt": "A",
			"extra-b.txt": "B",
			"extra-c.txt": "C",
		});
		expect(Math.abs((await widthOf()) - widthBefore)).toBeLessThanOrEqual(
			tolerancePx,
		);

		// 25vw of a 1200px viewport
		expect(Math.abs(widthBefore - 300)).toBeLessThanOrEqual(30);
	});

	test("sidebar width remains constant on small viewports", async ({
		page,
		browserName,
	}) => {
		// Force stacked layout via media query (<= 1024px)
		await page.setViewportSize({ width: 480, height: 720 });
		await uploadProject(browserName, page, makeManyFilesProject(15));

		const sidebar = page.locator(".sidebar");
		await expect(sidebar).toBeVisible();

		const widthOf = () =>
			sidebar.evaluate(
				(el: HTMLElement) => el.getBoundingClientRect().width,
			);
		const widthBefore = await widthOf();

		await page.locator(".file-item .delete-button").first().click();
		await expect(page.locator(".undo-bar")).toBeVisible();
		expect(Math.abs((await widthOf()) - widthBefore)).toBeLessThanOrEqual(
			tolerancePx,
		);

		await uploadProject(browserName, page, {
			"m1.txt": "1",
			"m2.txt": "2",
			"m3.txt": "3",
		});
		expect(Math.abs((await widthOf()) - widthBefore)).toBeLessThanOrEqual(
			tolerancePx,
		);
	});
});
