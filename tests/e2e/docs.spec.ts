/**
 * End-to-end tests for the `/docs` tutorial route
 *
 * Covers the static tutorial page ("Up and Running With Collagen"): that it
 * renders, that its table of contents has no dead anchors, that its tutorial
 * images actually load (they are served from `static/tutorial/` through
 * `asset()`, so a wrong base path yields an `<img>` element that is present but
 * broken), that its code blocks and callouts are consistent with each other,
 * and that the user can round-trip between the editor and the docs.
 *
 * All navigation is relative to `baseURL` and all URL assertions are suffix
 * matches, so these tests pass both with an empty base (the e2e preview server)
 * and with the `/collagen` base used for GitHub Pages.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

// =============================================================================
// Shared data and helpers
// =============================================================================

const DOCS_TITLE = "Up and Running With Collagen";

/** TOC entry text -> the in-page anchor it must resolve to, in document order */
const TOC_ENTRIES = [
	{ text: "Introduction", anchor: "introduction" },
	{ text: "Using Collagen", anchor: "using-collagen" },
	{ text: "A Basic Example", anchor: "basic-example" },
	{ text: "A More Complicated Example", anchor: "complicated-example" },
	{ text: "Memes", anchor: "memes" },
] as const;

/** Every image the tutorial embeds, by the tail of its `src` */
const TUTORIAL_IMAGES = [
	"/tutorial/smiley.jpg",
	"/tutorial/example-01.svg",
	"/tutorial/example-02.svg",
	"/tutorial/example-03.svg",
] as const;

/**
 * The code blocks in document order. `filename` is `null` for the block that
 * renders a shell command, which has no filename header. `id` is the `id` prop
 * the page passes to `CodeBlock`; it namespaces the callout anchor ids, so the
 * badge/note ids are derivable from it and can be checked without scraping.
 */
const CODE_BLOCKS = [
	{
		id: "ex1",
		filename: "example-01/collagen.jsonnet",
		language: "jsonnet",
		callouts: 4,
	},
	{ id: "cmd", filename: null, language: "bash", callouts: 0 },
	{
		id: "ex2",
		filename: "example-02/collagen.jsonnet",
		language: "jsonnet",
		callouts: 0,
	},
	{
		id: "ex3",
		filename: "example-03/collagen.jsonnet",
		language: "jsonnet",
		callouts: 4,
	},
] as const;

async function gotoDocs(page: Page) {
	await page.goto("/docs");
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(DOCS_TITLE);
}

/**
 * Assert an `<img>` finished decoding with real pixel data.
 *
 * `toBeVisible()` is not enough: a broken `src` still produces a laid-out,
 * "visible" element (these images carry explicit `width` attributes), so only
 * `naturalWidth` distinguishes a loaded image from a 404. Polled because the
 * assertion may run before the image has finished loading.
 */
async function expectImageLoaded(img: Locator) {
	await expect
		.poll(
			() =>
				img.evaluate(
					(el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
				),
			{ timeout: 10_000, message: `image ${img} never loaded` },
		)
		.toBe(true);
}

/**
 * The literal `// (n)` marker comments, as they appear in the *source* samples.
 *
 * `CodeBlock` strips these and re-renders them as badges, so seeing one in the
 * rendered text means the stripping regressed and readers are looking at
 * bookkeeping comments instead of clean, copy-pasteable Jsonnet.
 */
const LITERAL_MARKER = /\/\/\s*\(\d+\)/;

/**
 * Assert that an in-page `href` points at an element that exists, exactly once.
 *
 * Playwright will happily click a dangling `#anchor` and report success, so the
 * only way to catch a badge that links nowhere is to check that some element
 * owns the id. The count assertion also catches duplicate ids, which would make
 * the anchor resolve to whichever element happens to come first.
 */
async function expectAnchorResolves(
	page: Page,
	href: string | null,
	id: string,
) {
	expect(href).toBe(`#${id}`);
	await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
}

// =============================================================================
// Page basics
// =============================================================================

test.describe("Docs page", () => {
	test.beforeEach(async ({ page }) => {
		await gotoDocs(page);
	});

	test("loads with the expected document title and heading", async ({
		page,
	}) => {
		await expect(page).toHaveTitle(DOCS_TITLE);
		await expect(
			page.getByRole("heading", { name: DOCS_TITLE, level: 1 }),
		).toBeVisible();
		await expect(page.getByLabel("Contents")).toBeVisible();
	});

	// ==========================================================================
	// Table of contents
	// ==========================================================================

	test("table of contents lists exactly the expected entries in order", async ({
		page,
	}) => {
		const tocLinks = page.getByLabel("Contents").getByRole("link");

		await expect(tocLinks).toHaveText(TOC_ENTRIES.map(e => e.text));

		// Purely in-page anchors; the table of contents never links off the page
		const hrefs = await tocLinks.evaluateAll(els =>
			els.map(el => el.getAttribute("href") ?? ""),
		);
		expect(hrefs).toEqual(TOC_ENTRIES.map(e => `#${e.anchor}`));
	});

	for (const { text, anchor } of TOC_ENTRIES) {
		test(`table of contents link "${text}" resolves to a real section`, async ({
			page,
		}) => {
			const link = page
				.getByLabel("Contents")
				.getByRole("link", { name: text, exact: true });

			await expect(link).toHaveAttribute("href", `#${anchor}`);

			// The anchor is only meaningful if something on the page owns that id
			const section = page.locator(`section#${anchor}`);
			await expect(section).toHaveCount(1);

			await link.click();

			// Clicking must land on the anchor and bring the section into view
			await expect(page).toHaveURL(new RegExp(`#${anchor}$`));
			await expect(section).toBeInViewport();
			await expect(section.getByRole("heading", { level: 2 })).toHaveText(
				text,
			);
		});
	}

	test("every section referenced by the table of contents exists, and no others", async ({
		page,
	}) => {
		const sections = page.locator("article.docs section");
		await expect(sections).toHaveCount(TOC_ENTRIES.length);

		const ids = await sections.evaluateAll(els => els.map(el => el.id));
		expect(ids).toEqual(TOC_ENTRIES.map(e => e.anchor));
	});

	// ==========================================================================
	// Images
	// ==========================================================================

	test("renders exactly the expected tutorial images", async ({ page }) => {
		const images = page.locator("article.docs img");
		await expect(images).toHaveCount(TUTORIAL_IMAGES.length);

		const srcs = await images.evaluateAll(els =>
			els.map(el => el.getAttribute("src") ?? ""),
		);

		// Suffix comparison keeps this valid under both the empty base used by
		// the preview server and the `/collagen` base used on GitHub Pages
		expect(srcs.map(src => src.slice(src.indexOf("/tutorial/")))).toEqual([
			...TUTORIAL_IMAGES,
		]);
	});

	for (const [index, suffix] of TUTORIAL_IMAGES.entries()) {
		test(`tutorial image ${suffix} loads successfully`, async ({ page }) => {
			const img = page.locator("article.docs img").nth(index);
			await expect(img).toBeVisible();
			await expectImageLoaded(img);
		});
	}

	test("every tutorial image has non-empty alt text", async ({ page }) => {
		const alts = await page
			.locator("article.docs img")
			.evaluateAll(els => els.map(el => el.getAttribute("alt") ?? ""));

		expect(alts).toHaveLength(TUTORIAL_IMAGES.length);
		for (const alt of alts) expect(alt.trim()).not.toBe("");
	});

	// ==========================================================================
	// Code blocks and callouts
	// ==========================================================================

	// `.code-block` has no role or accessible name of its own, so a CSS locator
	// is the only way to address these; the markup comes from CodeBlock.svelte.
	test("renders the expected code blocks with the expected filenames", async ({
		page,
	}) => {
		const codeBlocks = page.locator(".code-block");
		await expect(codeBlocks).toHaveCount(CODE_BLOCKS.length);

		// No `f is string` predicate here: CODE_BLOCKS is a const assertion, so
		// filename is a union of string literals and the predicate would be
		// wider than the value it narrows. TS narrows this on its own.
		const expectedFilenames = CODE_BLOCKS.map(b => b.filename).filter(
			f => f !== null,
		);
		await expect(page.locator(".code-block .filename")).toHaveText(
			expectedFilenames,
		);

		for (const [index, spec] of CODE_BLOCKS.entries()) {
			const block = codeBlocks.nth(index);
			const pre = block.locator("pre.code");

			await expect(pre).toHaveAttribute("data-language", spec.language);
			await expect(block.locator(".filename")).toHaveCount(
				spec.filename === null ? 0 : 1,
			);
			if (spec.filename !== null) {
				await expect(block.locator(".filename")).toHaveText(spec.filename);
			}
		}
	});

	test("the shell code block shows the clgn invocation", async ({ page }) => {
		const bashBlock = page.locator(
			'.code-block:has(pre.code[data-language="bash"])',
		);
		await expect(bashBlock).toHaveCount(1);
		await expect(bashBlock.locator("pre.code")).toHaveText(
			"clgn -i example-01 -o example-01.svg",
		);
		// A shell one-liner needs neither a filename header nor callouts
		await expect(bashBlock.locator(".filename")).toHaveCount(0);
		await expect(bashBlock.locator("ol.callouts")).toHaveCount(0);
	});

	for (const [index, spec] of CODE_BLOCKS.entries()) {
		const label = spec.filename ?? spec.language;

		test(`code block ${index + 1} (${label}) renders no literal callout markers`, async ({
			page,
		}) => {
			const block = page.locator(".code-block").nth(index);
			const code = (await block.locator("pre.code").textContent()) ?? "";

			// The markers live in the samples as real comments so the snippets stay
			// runnable; none of them may survive into what the reader sees
			expect(code).not.toMatch(LITERAL_MARKER);
		});

		test(`code block ${index + 1} (${label}) has ${spec.callouts} callouts wired to their notes`, async ({
			page,
		}) => {
			const block = page.locator(".code-block").nth(index);
			const badges = block.locator("pre.code a.callout-marker");
			const notes = block.locator("ol.callouts li");

			await expect(badges).toHaveCount(spec.callouts);
			await expect(notes).toHaveCount(spec.callouts);

			if (spec.callouts === 0) {
				// Nothing to explain, so no explanation list either
				await expect(block.locator("ol.callouts")).toHaveCount(0);
				return;
			}

			const expectedNumbers = Array.from(
				{ length: spec.callouts },
				(_, i) => i + 1,
			);

			// Every number 1..n gets exactly one badge. Deliberately compared as a
			// sorted set, not in document order: a marker sits on the line it
			// describes, and in example-03 callout 2 explains the comprehension,
			// whose `for` clause trails the body it applies to. So the badges
			// legitimately read 1, 3, 4, 2 down the page.
			const badgeNumbers = await badges.evaluateAll(els =>
				els.map(el => Number(el.textContent)),
			);
			expect([...badgeNumbers].sort((a, b) => a - b)).toEqual(
				expectedNumbers,
			);

			// The notes, by contrast, are listed in numeric order; `value` drives
			// the rendered list numbering
			const values = await notes.evaluateAll(els =>
				els.map(el => Number(el.getAttribute("value"))),
			);
			expect(values).toEqual(expectedNumbers);

			// Badges and notes are addressed by id rather than by position, so the
			// pairing is checked independently of the order they appear in
			for (const n of expectedNumbers) {
				const markerId = `${spec.id}-marker-${n}`;
				const noteId = `${spec.id}-note-${n}`;

				const badge = block.locator(
					`pre.code a.callout-marker[id="${markerId}"]`,
				);
				const note = block.locator(`ol.callouts > li[id="${noteId}"]`);
				await expect(badge).toHaveCount(1);
				await expect(note).toHaveCount(1);

				// The badge carrying id `-marker-n` must also read as `n`
				await expect(badge).toHaveText(String(n));

				// Badge -> note, and the target is that list item rather than
				// merely some element that happens to own the id
				await expectAnchorResolves(
					page,
					await badge.getAttribute("href"),
					noteId,
				);

				// ...and note -> badge, back into this block's own code
				const backref = note.locator("a.callout-backref");
				await expect(backref).toHaveCount(1);
				await expect(backref).toHaveText(String(n));
				await expectAnchorResolves(
					page,
					await backref.getAttribute("href"),
					markerId,
				);
			}

			// An explanation with no text explains nothing. The prose lives in the
			// `<span>`; the `<li>` itself also holds the backref's digit.
			const texts = await notes
				.locator("span")
				.evaluateAll(els => els.map(el => (el.textContent ?? "").trim()));
			expect(texts).toHaveLength(spec.callouts);
			for (const text of texts) expect(text).not.toBe("");
		});
	}

	test("clicking a callout badge jumps to its note, and the note jumps back", async ({
		page,
	}) => {
		const badge = page.locator("a#ex1-marker-1");
		const note = page.locator("li#ex1-note-1");

		await badge.click();
		await expect(page).toHaveURL(/#ex1-note-1$/);
		await expect(note).toBeInViewport();

		await note.locator("a.callout-backref").click();
		await expect(page).toHaveURL(/#ex1-marker-1$/);
		await expect(badge).toBeInViewport();
	});

	test("Jsonnet samples are syntax highlighted and the shell one-liner is not", async ({
		page,
	}) => {
		for (const [index, spec] of CODE_BLOCKS.entries()) {
			const tokens = page
				.locator(".code-block")
				.nth(index)
				// Lezer's `classHighlighter` emits `tok-`-prefixed classes; a token
				// may carry several, but the prefix always leads
				.locator('pre.code span[class^="tok-"]');

			if (spec.language === "jsonnet") {
				expect(
					await tokens.count(),
					`block ${index + 1} (${spec.id}) has no highlighted tokens`,
				).toBeGreaterThan(0);
			} else {
				// Only Jsonnet has a grammar here; anything else must pass through
				await expect(tokens).toHaveCount(0);
			}
		}
	});

	// ==========================================================================
	// Footnote
	// ==========================================================================

	test("the footnote reference and its return link resolve to each other", async ({
		page,
	}) => {
		const ref = page.locator("a.footnote-ref");
		await expect(ref).toHaveAttribute("href", "#fn-1");

		const footnote = page.locator("li#fn-1");
		await expect(page.locator(".footnotes")).toHaveCount(1);
		await expect(footnote).toHaveCount(1);

		await ref.click();
		await expect(page).toHaveURL(/#fn-1$/);
		await expect(footnote).toBeInViewport();

		// And the footnote links back to where the reader left off
		await footnote.getByRole("link", { name: /back to content/i }).click();
		await expect(page).toHaveURL(/#fn-ref-1$/);
		await expect(page.locator("#fn-ref-1")).toBeInViewport();
	});
});

// =============================================================================
// Round-trip navigation between the editor and the docs
// =============================================================================

/**
 * Wait for the editor route to be interactive.
 *
 * These tests deliberately do not use the shared `./fixtures` `test`, which
 * waits on the FileUploader; the docs route has no uploader, and the round-trip
 * only needs the editor's file list and intro pane.
 */
async function gotoEditor(page: Page) {
	await page.goto("/");
	await expect(
		page.getByRole("region", { name: /file information/i }),
	).toBeVisible();
}

test.describe("Editor <-> docs navigation", () => {
	test("the intro pane tutorial link opens the docs, and the back link returns", async ({
		page,
	}) => {
		await gotoEditor(page);

		const tutorialLink = page.getByRole("link", { name: DOCS_TITLE });
		await expect(tutorialLink).toBeVisible();

		await tutorialLink.click();

		// Suffix match: valid under both an empty base and the `/collagen` base
		await expect(page).toHaveURL(/\/docs\/?$/);
		await expect(
			page.getByRole("heading", { name: DOCS_TITLE, level: 1 }),
		).toBeVisible();
		await expect(page).toHaveTitle(DOCS_TITLE);

		const backLink = page.locator("a.back-link");
		await expect(backLink).toHaveText(/back to the editor/i);

		await backLink.click();

		// Back on the editor, with its file list and its link to the docs
		await expect(
			page.getByRole("region", { name: /file information/i }),
		).toBeVisible();
		await expect(page.getByRole("link", { name: DOCS_TITLE })).toBeVisible();
		await expect(page).toHaveTitle(/collagen/i);
	});

	test("the docs page can be reached directly and links back to the editor", async ({
		page,
	}) => {
		await gotoDocs(page);

		await page.getByRole("link", { name: /back to the editor/i }).click();

		await expect(
			page.getByRole("region", { name: /file information/i }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: /create new empty file/i }),
		).toBeVisible();
	});
});
