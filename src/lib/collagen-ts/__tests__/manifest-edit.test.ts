/**
 * The edit engine: turning a GUI gesture into a text change.
 *
 * Two properties matter more than any individual case. An edit must leave the
 * rest of the file byte for byte identical, because the user's comments and
 * formatting are the reason they are writing Jsonnet at all. And an edit must
 * produce something sjsonnet still accepts, so several tests here evaluate the
 * result rather than eyeballing the text.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import {
	insertChild,
	moveChild,
	printElement,
	removeAttribute,
	removeChild,
	setAttribute,
} from "../manifest/edit.js";
import {
	asObjectBody,
	fieldsOf,
	findField,
	objectBodyAtBrace,
	parseManifest,
} from "../manifest/cst.js";
import { InMemoryFileSystem } from "../filesystem/index.js";
import { detectStyle, printKey, printNumber } from "../manifest/style.js";
import { SjsonnetMain } from "../jsonnet/sjsonnet.js";

/** Offset of the object literal containing `needle`. */
function braceBefore(source: string, needle: string): number {
	const at = source.indexOf(needle);
	if (at < 0) throw new Error(`no ${needle} in source`);
	return source.lastIndexOf("{", at);
}

function evaluate(source: string): unknown {
	return SjsonnetMain.interpret(
		source,
		{},
		{},
		"",
		(_wd, imported) => imported,
		() => "{}",
	);
}

function expectOk(outcome: ReturnType<typeof setAttribute>): string {
	if (!outcome.ok) throw new Error(`blocked: ${outcome.reason}`);
	return outcome.source;
}

describe("setAttribute on an existing literal", () => {
	it("replaces a number in place, changing nothing else", () => {
		const source = '{ tag: "rect", attrs: { x: 10, y: 20 } }';
		expect(expectOk(setAttribute(source, 0, "x", 55))).toBe(
			'{ tag: "rect", attrs: { x: 55, y: 20 } }',
		);
	});

	it("replaces a negative number, which is a unary expression not a number", () => {
		const source = '{ tag: "rect", attrs: { x: -5 } }';
		expect(expectOk(setAttribute(source, 0, "x", 12))).toBe(
			'{ tag: "rect", attrs: { x: 12 } }',
		);
	});

	it("writes a negative value back", () => {
		const source = '{ tag: "rect", attrs: { x: 5 } }';
		expect(expectOk(setAttribute(source, 0, "x", -12))).toContain("x: -12");
	});

	it("replaces a string, keeping the file's quote character", () => {
		const source = "{ tag: 'rect', attrs: { fill: 'red' } }";
		expect(expectOk(setAttribute(source, 0, "fill", "blue"))).toBe(
			"{ tag: 'rect', attrs: { fill: 'blue' } }",
		);
	});

	it("leaves comments and blank lines untouched", () => {
		const source = [
			"{",
			'\ttag: "rect", // the box',
			"\tattrs: {",
			"\t\t// position",
			"\t\tx: 10,",
			"",
			"\t\ty: 20,",
			"\t},",
			"}",
		].join("\n");
		const edited = expectOk(setAttribute(source, 0, "x", 99));
		expect(edited).toBe(source.replace("x: 10", "x: 99"));
	});

	it("rounds a pointer coordinate instead of writing a binary fraction", () => {
		const source = "{ tag: 'rect', attrs: { x: 0 } }";
		expect(expectOk(setAttribute(source, 0, "x", 0.1 + 0.2))).toContain(
			"x: 0.3",
		);
	});
});

describe("setAttribute when the key is missing", () => {
	it("adds a key to a one-line attrs object, inline", () => {
		const source = '{ tag: "rect", attrs: { x: 10 } }';
		expect(expectOk(setAttribute(source, 0, "y", 20))).toBe(
			'{ tag: "rect", attrs: { x: 10, y: 20 } }',
		);
	});

	it("adds a key to a multi-line attrs object, matching indent and trailing comma", () => {
		const source = [
			"{",
			"\ttag: 'rect',",
			"\tattrs: {",
			"\t\tx: 10,",
			"\t},",
			"}",
		].join("\n");
		expect(expectOk(setAttribute(source, 0, "y", 20))).toBe(
			[
				"{",
				"\ttag: 'rect',",
				"\tattrs: {",
				"\t\tx: 10,",
				"\t\ty: 20,",
				"\t},",
				"}",
			].join("\n"),
		);
	});

	it("respects a file that does not use trailing commas", () => {
		const source = [
			"{",
			"  tag: 'rect',",
			"  attrs: {",
			"    x: 10",
			"  }",
			"}",
		].join("\n");
		const edited = expectOk(setAttribute(source, 0, "y", 20));
		expect(edited).toContain("    x: 10,\n    y: 20\n");
	});

	it("quotes a key that cannot be written bare", () => {
		const source = '{ tag: "text", attrs: { x: 1 } }';
		expect(expectOk(setAttribute(source, 0, "font-size", 12))).toContain(
			'"font-size": 12',
		);
	});

	it("quotes a key that would otherwise be a keyword", () => {
		const source = '{ tag: "rect", attrs: { x: 1 } }';
		expect(expectOk(setAttribute(source, 0, "for", "y"))).toContain('"for"');
	});

	it("adds attrs entirely when the tag has none", () => {
		const source = '{ tag: "rect" }';
		const edited = expectOk(setAttribute(source, 0, "x", 5));
		expect(edited).toBe('{ tag: "rect", attrs: { x: 5 } }');
		expect(evaluate(edited)).toEqual({ tag: "rect", attrs: { x: 5 } });
	});

	it("adds attrs after a local, not between locals", () => {
		const source = ["{", "\tlocal w = 10,", "\ttag: 'rect',", "}"].join("\n");
		const edited = expectOk(setAttribute(source, 0, "x", 5));
		expect(edited).toBe(
			[
				"{",
				"\tlocal w = 10,",
				"\ttag: 'rect',",
				"\tattrs: { x: 5 },",
				"}",
			].join("\n"),
		);
	});
});

describe("setAttribute when it cannot splice", () => {
	it("refuses to overwrite a computed value, and says what it is", () => {
		const source = "{ tag: 'rect', attrs: { x: cx + dx } }";
		const outcome = setAttribute(source, 0, "x", 5);
		expect(outcome.ok).toBe(false);
		if (outcome.ok) return;
		expect(outcome.blockedBy).toBe("computed");
		expect(outcome.reason).toContain("cx + dx");
	});

	it("refuses when attrs itself is computed", () => {
		const source = "{ tag: 'rect', attrs: makeAttrs(1) }";
		const outcome = setAttribute(source, 0, "x", 5);
		expect(outcome.ok).toBe(false);
		if (outcome.ok) return;
		expect(outcome.blockedBy).toBe("computed");
	});

	it("refuses to add a key beside a computed one, which could collide", () => {
		const source = "{ tag: 'rect', attrs: { [k]: 1 } }";
		const outcome = setAttribute(source, 0, "x", 5);
		expect(outcome.ok).toBe(false);
		if (outcome.ok) return;
		expect(outcome.blockedBy).toBe("dynamic-key");
	});

	it("reports a target that is no longer there", () => {
		const outcome = setAttribute('{ tag: "rect" }', 999, "x", 5);
		expect(outcome.ok).toBe(false);
		if (outcome.ok) return;
		expect(outcome.blockedBy).toBe("not-found");
	});
});

describe("editing inside a loop body", () => {
	// The engine is mechanical: the loop body is a literal like any other, so a
	// splice there changes every element the loop produces. Warning the user is
	// the editor's job, not this layer's.
	const source = [
		"{",
		"\tchildren: [",
		"\t\t{ tag: 'circle', attrs: { r: 5 } }",
		"\t\tfor i in std.range(0, 3)",
		"\t],",
		"}",
	].join("\n");

	it("edits the template, so every instance changes", () => {
		const brace = braceBefore(source, "tag: 'circle'");
		const edited = expectOk(setAttribute(source, brace, "r", 9));
		expect(edited).toContain("attrs: { r: 9 }");
		expect(edited).toContain("for i in std.range(0, 3)");

		const result = evaluate(edited) as {
			children: { attrs: { r: number } }[];
		};
		expect(result.children).toHaveLength(4);
		expect(result.children.every(c => c.attrs.r === 9)).toBe(true);
	});
});

describe("removeAttribute", () => {
	it("removes a key and its comma from a one-line object", () => {
		const source = "{ tag: 'rect', attrs: { x: 1, y: 2 } }";
		expect(expectOk(removeAttribute(source, 0, "x"))).toBe(
			"{ tag: 'rect', attrs: { y: 2 } }",
		);
	});

	it("removes the last key by taking the comma before it", () => {
		const source = "{ tag: 'rect', attrs: { x: 1, y: 2 } }";
		expect(expectOk(removeAttribute(source, 0, "y"))).toBe(
			"{ tag: 'rect', attrs: { x: 1 } }",
		);
	});

	it("removes a whole line from a multi-line object", () => {
		const source = [
			"{",
			"\tattrs: {",
			"\t\tx: 1,",
			"\t\ty: 2,",
			"\t},",
			"}",
		].join("\n");
		expect(expectOk(removeAttribute(source, 0, "x"))).toBe(
			["{", "\tattrs: {", "\t\ty: 2,", "\t},", "}"].join("\n"),
		);
	});

	it("does nothing when the key was never there", () => {
		const source = "{ tag: 'rect', attrs: { x: 1 } }";
		expect(expectOk(removeAttribute(source, 0, "nope"))).toBe(source);
	});
});

describe("insertChild", () => {
	it("appends to a multi-line list", () => {
		const source = [
			"{",
			"\tchildren: [",
			"\t\t{ tag: 'rect' },",
			"\t],",
			"}",
		].join("\n");
		expect(expectOk(insertChild(source, 0, 1, "{ tag: 'circle' }"))).toBe(
			[
				"{",
				"\tchildren: [",
				"\t\t{ tag: 'rect' },",
				"\t\t{ tag: 'circle' },",
				"\t],",
				"}",
			].join("\n"),
		);
	});

	it("inserts before an existing element", () => {
		const source = [
			"{",
			"\tchildren: [",
			"\t\t{ tag: 'rect' },",
			"\t],",
			"}",
		].join("\n");
		const edited = expectOk(insertChild(source, 0, 0, "{ tag: 'circle' }"));
		expect(edited.indexOf("circle")).toBeLessThan(edited.indexOf("rect"));
	});

	it("appends to a one-line list", () => {
		const source = "{ children: [{ tag: 'rect' }] }";
		expect(expectOk(insertChild(source, 0, 1, "{ tag: 'circle' }"))).toBe(
			"{ children: [{ tag: 'rect' }, { tag: 'circle' }] }",
		);
	});

	it("fills an empty list", () => {
		const source = "{ children: [] }";
		expect(expectOk(insertChild(source, 0, 0, "{ tag: 'rect' }"))).toBe(
			"{ children: [{ tag: 'rect' }] }",
		);
	});

	it("adds a children field when there is none", () => {
		const source = "{ tag: 'g' }";
		const edited = expectOk(insertChild(source, 0, 0, "{ tag: 'rect' }"));
		expect(edited).toBe("{ tag: 'g', children: [{ tag: 'rect' }] }");
		expect(evaluate(edited)).toEqual({
			tag: "g",
			children: [{ tag: "rect" }],
		});
	});

	it("wraps a lone child object into a list first, as validation would", () => {
		const source = "{ tag: 'g', children: { tag: 'rect' } }";
		expect(expectOk(insertChild(source, 0, 1, "{ tag: 'circle' }"))).toBe(
			"{ tag: 'g', children: [{ tag: 'rect' }, { tag: 'circle' }] }",
		);
	});

	it("refuses to insert into a loop, and says to detach it", () => {
		const source = "{ children: [{ tag: 'c' } for i in std.range(0, 2)] }";
		const outcome = insertChild(source, 0, 0, "{ tag: 'rect' }");
		expect(outcome.ok).toBe(false);
		if (outcome.ok) return;
		expect(outcome.reason).toContain("Detach");
	});
});

describe("removeChild", () => {
	it("removes an element and its line", () => {
		const source = [
			"{",
			"\tchildren: [",
			"\t\t{ tag: 'rect' },",
			"\t\t{ tag: 'circle' },",
			"\t],",
			"}",
		].join("\n");
		expect(expectOk(removeChild(source, 0, 0))).toBe(
			["{", "\tchildren: [", "\t\t{ tag: 'circle' },", "\t],", "}"].join(
				"\n",
			),
		);
	});

	it("leaves valid Jsonnet when removing the last element", () => {
		const source = "{ children: [{ tag: 'rect' }, { tag: 'circle' }] }";
		const edited = expectOk(removeChild(source, 0, 1));
		expect(evaluate(edited)).toEqual({ children: [{ tag: "rect" }] });
	});

	it("empties a list down to nothing", () => {
		const source = "{ children: [{ tag: 'rect' }] }";
		const edited = expectOk(removeChild(source, 0, 0));
		expect(evaluate(edited)).toEqual({ children: [] });
	});
});

describe("moveChild", () => {
	it("reorders a multi-line list", () => {
		const source = [
			"{",
			"\tchildren: [",
			"\t\t{ tag: 'a' },",
			"\t\t{ tag: 'b' },",
			"\t\t{ tag: 'c' },",
			"\t],",
			"}",
		].join("\n");
		expect(expectOk(moveChild(source, 0, 2, 0))).toBe(
			[
				"{",
				"\tchildren: [",
				"\t\t{ tag: 'c' },",
				"\t\t{ tag: 'a' },",
				"\t\t{ tag: 'b' },",
				"\t],",
				"}",
			].join("\n"),
		);
	});

	it("carries an element's own comment with it", () => {
		const source = [
			"{",
			"\tchildren: [",
			"\t\t{ tag: 'a' },",
			"\t\t// the important one",
			"\t\t{ tag: 'b' },",
			"\t],",
			"}",
		].join("\n");
		const edited = expectOk(moveChild(source, 0, 1, 0));
		expect(edited.indexOf("// the important one")).toBeLessThan(
			edited.indexOf("{ tag: 'b' }"),
		);
		expect(edited.indexOf("{ tag: 'b' }")).toBeLessThan(
			edited.indexOf("{ tag: 'a' }"),
		);
	});

	it("keeps a nested element intact", () => {
		const source = [
			"{",
			"\tchildren: [",
			"\t\t{ tag: 'a' },",
			"\t\t{",
			"\t\t\ttag: 'g',",
			"\t\t\tchildren: [{ tag: 'inner' }],",
			"\t\t},",
			"\t],",
			"}",
		].join("\n");
		const edited = expectOk(moveChild(source, 0, 1, 0));
		expect(evaluate(edited)).toEqual({
			children: [{ tag: "g", children: [{ tag: "inner" }] }, { tag: "a" }],
		});
	});

	it("is a no-op when nothing moves", () => {
		const source = "{ children: [{ tag: 'a' }, { tag: 'b' }] }";
		expect(expectOk(moveChild(source, 0, 1, 1))).toBe(source);
	});
});

describe("style detection", () => {
	it("prints numbers Jsonnet accepts, never a bare .5", () => {
		expect(printNumber(0.5)).toBe("0.5");
		expect(printNumber(5)).toBe("5");
		expect(printNumber(-0.25)).toBe("-0.25");
		expect(printNumber(1 / 3)).toBe("0.333");
	});

	it("follows a file that quotes its keys", () => {
		const source = '{ "tag": "rect", "attrs": { "x": 1 } }';
		const style = detectStyle(source, parseManifest(source));
		expect(printKey("y", style)).toBe('"y"');
	});

	it("follows a file that writes keys bare", () => {
		const source = "{ tag: 'rect', attrs: { x: 1 } }";
		const style = detectStyle(source, parseManifest(source));
		expect(printKey("y", style)).toBe("y");
	});
});

/** Every manifest checked into `tests/examples`. */
function exampleManifests(dir: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) found.push(...exampleManifests(path));
		else if (/^collagen\.(json|jsonnet)$/.test(entry)) found.push(path);
	}
	return found;
}

/**
 * The skeleton directory a manifest belongs to.
 *
 * Rooting matters. `compileJsonnet` resolves a top-level import against the
 * empty string rather than the manifest's directory, so `random-gibberish`'s
 * `import 'shared/shared.libjsonnet'` only resolves when the filesystem is
 * rooted at the skeleton -- which is how the app loads one.
 */
function skeletonRoot(manifestPath: string): string {
	let dir = dirname(manifestPath);
	while (dir.startsWith("tests/examples/")) {
		const parent = dirname(dir);
		if (parent === "tests/examples") return dir;
		if (basename(dir) === "skeleton") return dir;
		dir = parent;
	}
	return dirname(manifestPath);
}

/** Load a directory tree into a filesystem, with paths relative to its root. */
function loadTree(
	dir: string,
	root: string,
	fs: InMemoryFileSystem,
): InMemoryFileSystem {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) loadTree(path, root, fs);
		else {
			fs.addFileContents(
				relative(root, path),
				new Uint8Array(readFileSync(path)),
			);
		}
	}
	return fs;
}

/**
 * The first attribute of this tag whose value is a plain number.
 *
 * Editing has to target a real tag object. Picking one by scanning the text
 * would land inside an `attrs` object as easily as on the tag that owns it, and
 * a tag brace is exactly what provenance hands the editor at runtime.
 */
function numericAttribute(
	source: string,
	braceFrom: number,
): { key: string; value: number } | null {
	const body = objectBodyAtBrace(parseManifest(source), braceFrom);
	if (!body) return null;

	const attrs = findField(body, source, "attrs");
	const attrsBody = attrs && asObjectBody(attrs.valueNode);
	if (!attrsBody) return null;

	for (const field of fieldsOf(attrsBody, source)) {
		if (field.name === null || field.valueNode.name !== "Number") continue;
		return {
			key: field.name,
			value: Number(source.slice(field.valueNode.from, field.valueNode.to)),
		};
	}
	return null;
}

describe("round-tripping the shipped examples", () => {
	const manifests = exampleManifests("tests/examples");
	let roundTripped = 0;

	it("found manifests to test", () => {
		expect(manifests.length).toBeGreaterThan(0);
	});

	it.each(manifests)(
		"%s comes back byte for byte after a change and its undo",
		async path => {
			const source = readFileSync(path, "utf8");
			const root = skeletonRoot(path);
			const fs = loadTree(root, root, InMemoryFileSystem.createEmpty());

			// Every shipped example must be analyzable at all -- that is the
			// assertion for the handful with no numeric attribute to round-trip.
			const analysis = await fs.analyzeManifest(
				relative(root, dirname(path)),
			);
			expect(analysis.ok ? "" : analysis.reason).toBe("");
			if (!analysis.ok) return;

			let edited = 0;
			for (const ref of analysis.provenance.sourceOf.values()) {
				const attribute = numericAttribute(source, ref.braceFrom);
				if (!attribute) continue;

				const changed = setAttribute(
					source,
					ref.braceFrom,
					attribute.key,
					attribute.value + 1,
				);
				if (!changed.ok) continue;
				expect(changed.source).not.toBe(source);

				const restored = setAttribute(
					changed.source,
					ref.braceFrom,
					attribute.key,
					attribute.value,
				);
				if (!restored.ok) throw new Error(restored.reason);
				expect(restored.source, `${path} @ ${ref.braceFrom}`).toBe(source);
				edited++;
			}

			roundTripped += edited;
		},
	);

	it("round-tripped a real number of attributes, not zero", () => {
		// Without this the suite above would pass just as well if every
		// manifest quietly turned out to have nothing editable in it.
		expect(roundTripped).toBeGreaterThan(20);
	});

	it("finds editable attributes in a representative example", async () => {
		const dir = "tests/examples/basic-smiley-pure-svg/skeleton";
		const source = readFileSync(join(dir, "collagen.json"), "utf8");
		const fs = loadTree(dir, dir, InMemoryFileSystem.createEmpty());
		const analysis = await fs.analyzeManifest();
		if (!analysis.ok) throw new Error(analysis.reason);

		const withNumbers = [...analysis.provenance.sourceOf.values()].filter(
			ref => numericAttribute(source, ref.braceFrom) !== null,
		);
		expect(withNumbers.length).toBeGreaterThan(0);
	});
});

describe("structural edits keep every example valid", () => {
	const manifests = exampleManifests("tests/examples");

	/** Children of the root, as the layers tree would count them. */
	function rootChildCount(value: unknown): number {
		if (value === null || typeof value !== "object" || Array.isArray(value)) {
			return 0;
		}
		const children = (value as Record<string, unknown>).children;
		if (children === undefined || children === null) return 0;
		return Array.isArray(children) ? children.length : 1;
	}

	it.each(manifests)(
		"%s survives inserting a child at every position",
		async path => {
			const source = readFileSync(path, "utf8");
			const root = skeletonRoot(path);
			const fs = loadTree(root, root, InMemoryFileSystem.createEmpty());
			const dir = relative(root, dirname(path));

			const analysis = await fs.analyzeManifest(dir);
			expect(analysis.ok ? "" : analysis.reason).toBe("");
			if (!analysis.ok) return;

			const rootBrace = analysis.provenance.sourceOf.get("")?.braceFrom;
			if (rootBrace === undefined) return;

			const before = rootChildCount(analysis.value);
			for (let index = 0; index <= before; index++) {
				const outcome = insertChild(
					source,
					rootBrace,
					index,
					printElement(source, "tag", "rect", { x: 1, y: 2 }),
				);
				// A manifest whose children come from a loop refuses, by design.
				if (!outcome.ok) continue;

				// The result must still be a manifest, with one more child.
				const edited = loadTree(
					root,
					root,
					InMemoryFileSystem.createEmpty(),
				);
				edited.addFileContents(
					relative(root, path),
					new TextEncoder().encode(outcome.source),
				);
				const after = await edited.analyzeManifest(dir);
				expect(rootChildCount(after.value), `${path} @ ${index}`).toBe(
					before + 1,
				);
			}
		},
	);

	it.each(manifests)("%s survives removing each child", async path => {
		const source = readFileSync(path, "utf8");
		const root = skeletonRoot(path);
		const fs = loadTree(root, root, InMemoryFileSystem.createEmpty());
		const dir = relative(root, dirname(path));

		const analysis = await fs.analyzeManifest(dir);
		expect(analysis.ok ? "" : analysis.reason).toBe("");
		if (!analysis.ok) return;

		const rootBrace = analysis.provenance.sourceOf.get("")?.braceFrom;
		if (rootBrace === undefined) return;

		const before = rootChildCount(analysis.value);
		for (let index = 0; index < before; index++) {
			const outcome = removeChild(source, rootBrace, index);
			if (!outcome.ok) continue;

			const edited = loadTree(root, root, InMemoryFileSystem.createEmpty());
			edited.addFileContents(
				relative(root, path),
				new TextEncoder().encode(outcome.source),
			);
			const after = await edited.analyzeManifest(dir);
			expect(rootChildCount(after.value), `${path} @ ${index}`).toBe(
				before - 1,
			);
		}
	});

	it.each(manifests)("%s survives reordering its children", async path => {
		const source = readFileSync(path, "utf8");
		const root = skeletonRoot(path);
		const fs = loadTree(root, root, InMemoryFileSystem.createEmpty());
		const dir = relative(root, dirname(path));

		const analysis = await fs.analyzeManifest(dir);
		expect(analysis.ok ? "" : analysis.reason).toBe("");
		if (!analysis.ok) return;

		const rootBrace = analysis.provenance.sourceOf.get("")?.braceFrom;
		if (rootBrace === undefined) return;

		const before = rootChildCount(analysis.value);
		if (before < 2) return;

		// Moving the last child to the front, then back, restores the manifest.
		const moved = moveChild(source, rootBrace, before - 1, 0);
		if (!moved.ok) return;

		const edited = loadTree(root, root, InMemoryFileSystem.createEmpty());
		edited.addFileContents(
			relative(root, path),
			new TextEncoder().encode(moved.source),
		);
		const after = await edited.analyzeManifest(dir);
		expect(rootChildCount(after.value), path).toBe(before);

		// And the order really changed.
		expect(moved.source).not.toBe(source);
	});
});

describe("printElement", () => {
	const jsonnetSource = '{ children: [{ tag: "rect" }] }';
	const jsonSource = '{"children": [{"tag": "rect"}]}';

	it("writes a shape with `tag` as its primary key", () => {
		expect(printElement(jsonnetSource, "tag", "rect", { x: 1 })).toBe(
			'{ tag: "rect", attrs: { x: 1 } }',
		);
	});

	it("writes an image with `image_path` instead", () => {
		// Validation dispatches on the primary key, so an image tag must carry
		// `image_path` and no `tag`.
		expect(
			printElement(jsonnetSource, "image_path", "photos/cat.jpg", {
				x: 1,
				width: 10,
			}),
		).toBe('{ image_path: "photos/cat.jpg", attrs: { x: 1, width: 10 } }');
	});

	it("quotes keys in a JSON manifest", () => {
		expect(printElement(jsonSource, "image_path", "cat.jpg", { x: 1 })).toBe(
			'{ "image_path": "cat.jpg", "attrs": { "x": 1 } }',
		);
	});

	it("adds text content when given some", () => {
		expect(printElement(jsonnetSource, "tag", "text", { x: 1 }, "Hi")).toBe(
			'{ tag: "text", attrs: { x: 1 }, children: "Hi" }',
		);
	});

	it("produces something the pipeline accepts", async () => {
		const element = printElement(jsonnetSource, "image_path", "cat.jpg", {
			x: 1,
			y: 2,
		});
		const outcome = insertChild(jsonnetSource, 0, 1, element);
		if (!outcome.ok) throw new Error(outcome.reason);

		const fs = InMemoryFileSystem.createEmpty();
		fs.addFileContents(
			"collagen.jsonnet",
			new TextEncoder().encode(outcome.source),
		);
		fs.addFileContents("cat.jpg", new Uint8Array([1, 2, 3]));

		const svg = await fs.generateSvg();
		expect(svg).toContain("<image");
		expect(svg).toContain('x="1"');
	});
});
