/**
 * SVG generation system for Collagen
 *
 * This module handles the conversion of validated tag structures into
 * SVG XML output.
 */

import type {
	AnyChildTag,
	RootTag,
	XmlAttrs,
	GenericTag,
	TextTag,
	ImageTag,
	ContainerTag,
	FontTag,
	NestedSvgTag,
} from "../types/index.js";

import { InMemoryFileSystem } from "../filesystem/index.js";
import { normalizedPathJoin } from "../filesystem/index.js";
import { base64Encode, escapeXml } from "../utils/index.js";
import {
	ImageError,
	FontError,
	BundledFontNotFoundError,
	XmlError,
} from "../errors/index.js";

import impactB64Url from "$lib/fonts/impact.woff2?url";

// =============================================================================
// SVG Generation Context
// =============================================================================

/** Context passed through SVG generation */
export interface SvgGenerationContext {
	filesystem: InMemoryFileSystem;
	currentDir: string; // Current directory context for resolving relative paths
	/**
	 * Stamp every element with the manifest path that produced it, for the
	 * visual editor to hit-test against.
	 *
	 * Off by default, so ordinary output stays byte for byte what it was.
	 */
	annotate?: boolean;
}

/**
 * Add the editor's provenance attribute to a tag's attributes.
 *
 * Appended last so a manifest that happens to set `data-clgn-path` itself
 * cannot shadow the real one, matching how `generateImageTag` guarantees its
 * own `href` wins.
 */
function annotated(
	attrs: XmlAttrs,
	context: SvgGenerationContext,
	path: string,
	opaque: boolean = false,
): XmlAttrs {
	if (!context.annotate) return attrs;
	return opaque
		? { ...attrs, "data-clgn-path": path, "data-clgn-opaque": "" }
		: { ...attrs, "data-clgn-path": path };
}

/**
 * The path of the `i`th child of `parentPath`.
 *
 * Kept identical to `manifest/provenance.ts`'s `childPath`, since the two walks
 * have to agree on every string for hit-testing to resolve.
 */
function childPath(parentPath: string, i: number): string {
	return parentPath === "" ? `children[${i}]` : `${parentPath}.children[${i}]`;
}

/** Generate each child of a tag, numbering them for provenance. */
async function generateChildren(
	children: AnyChildTag[],
	context: SvgGenerationContext,
	path: string,
): Promise<string> {
	const parts = await Promise.all(
		Array.from({ length: children.length }, (_, i) =>
			generateAnyChildTag(children[i], context, childPath(path, i)),
		),
	);
	return parts.join("");
}

// =============================================================================
// Path Resolution Utilities
// =============================================================================

/** Resolve a resource path relative to the current directory context */
function resolvePath(
	context: SvgGenerationContext,
	relativePath: string,
): string {
	return normalizedPathJoin(context.currentDir, relativePath);
}

// =============================================================================
// XML Writing Utilities
// =============================================================================

/** Write XML attributes to a string */
function writeAttributes(attrs: XmlAttrs): string {
	const parts: string[] = [];

	for (const key in attrs) {
		const value = attrs[key];
		const escapedValue = escapeXml(String(value));
		parts.push(`${key}="${escapedValue}"`);
	}

	return parts.join(" ");
}

/** Write an XML tag with attributes and content */
function writeTag(
	tagName: string,
	attrs: XmlAttrs,
	content: string = "",
	selfClosing: boolean = false,
): string {
	const attrString = writeAttributes(attrs);
	const attrPart = attrString ? ` ${attrString}` : "";

	if (selfClosing && !content) {
		return `<${tagName}${attrPart}/>`;
	} else if (!content) {
		return `<${tagName}${attrPart}></${tagName}>`;
	} else {
		return `<${tagName}${attrPart}>${content}</${tagName}>`;
	}
}

/** Write text content with optional escaping */
function writeTextContent(text: string): string {
	return escapeXml(text);
}

// =============================================================================
// Tag Generation Functions
// =============================================================================

/** Generate SVG for a generic tag */
async function generateGenericTag(
	tag: GenericTag,
	context: SvgGenerationContext,
	path: string,
): Promise<string> {
	const content = await generateChildren(tag.children, context, path);
	const isSelfClosing = content === "" && isSelfClosingTag(tag.tagName);

	return writeTag(
		tag.tagName,
		annotated(tag.attrs, context, path),
		content,
		isSelfClosing,
	);
}

/** Generate SVG for a text tag */
async function generateTextTag(
	tag: TextTag,
	_context: SvgGenerationContext,
): Promise<string> {
	// Bare escaped text, so there is no element to carry a path. The editor
	// attributes text to its parent element and edits it from there.
	return writeTextContent(tag.text);
}

/** Generate SVG for an image tag */
async function generateImageTag(
	tag: ImageTag,
	context: SvgGenerationContext,
	path: string,
): Promise<string> {
	try {
		// Resolve image path relative to current directory
		const resolvedPath = resolvePath(context, tag.imagePath);

		// Fetch image file
		const fileContent = context.filesystem.load(resolvedPath);

		// Determine image type
		const imageKind = tag.kind || inferImageKind(tag.imagePath);

		// Encode as base64
		const base64Data = base64Encode(fileContent.bytes);
		const dataUri = `data:image/${imageKind};base64,${base64Data}`;

		// Create image attributes
		const imageAttrs: XmlAttrs = annotated(
			{ ...tag.attrs, href: dataUri },
			context,
			path,
		);

		const content = await generateChildren(tag.children, context, path);
		return writeTag("image", imageAttrs, content, content === "");
	} catch (error) {
		throw new ImageError(
			`Failed to process image at ${tag.imagePath}: ${String(error)}`,
		);
	}
}

/** Generate SVG for a container tag */
async function generateContainerTag(
	tag: ContainerTag,
	context: SvgGenerationContext,
	path: string,
): Promise<string> {
	try {
		// Resolve container path relative to current directory
		const resolvedPath = resolvePath(context, tag.clgnPath);

		// Create a new filesystem context for the nested folder
		const nestedContext = createNestedContext(context, resolvedPath);

		const nestedRootTag =
			await nestedContext.filesystem.generateRootTag(resolvedPath);

		// Generate children content (not the full SVG wrapper).
		//
		// The nested children come from a different manifest, so the outer
		// path does not extend into them. The group is marked opaque and the
		// editor resolves any hit inside it to the container itself.
		const nestedContent = await Promise.all(
			Array.from({ length: nestedRootTag.children.length }, (_, i) =>
				generateAnyChildTag(nestedRootTag.children[i], nestedContext, ""),
			),
		);

		const content = nestedContent.join("");

		// Wrap in a group with the nested root's attributes
		return writeTag(
			"g",
			annotated(nestedRootTag.attrs, context, path, true),
			content,
		);
	} catch (error) {
		throw new XmlError(
			`Failed to process container at ${tag.clgnPath}: ${String(error)}`,
		);
	}
}

/** Generate SVG for a font tag */
async function generateFontTag(
	tag: FontTag,
	context: SvgGenerationContext,
	path: string,
): Promise<string> {
	try {
		let styleContent = "";

		for (const font of tag.fonts) {
			styleContent += "@font-face{";
			styleContent += `font-family:${font.name};`;

			let fontDataBase64;
			if ("path" in font) {
				// User-provided font - resolve path relative to current directory
				const resolvedFontPath = resolvePath(context, font.path);
				const fileContent = context.filesystem.load(resolvedFontPath);
				fontDataBase64 = base64Encode(fileContent.bytes);
			} else {
				fontDataBase64 = await getBundledFontDataBase64(font.name);
			}

			// TODO: make this handle font formats other than woff2
			const dataUri = `url('data:font/woff2;charset=utf-8;base64,${fontDataBase64}') format('woff2')`;

			styleContent += `src:${dataUri};`;

			// Add custom attributes
			if (font.attrs) {
				for (const key in font.attrs) {
					const value = font.attrs[key];
					styleContent += `${key}:${value};`;
				}
			}

			styleContent += "}";
		}

		const fullStyleContent = `<style>${styleContent}</style>`;
		return writeTag(
			"defs",
			annotated(tag.attrs, context, path),
			fullStyleContent,
		);
	} catch (error) {
		throw new FontError(`Failed to process fonts: ${String(error)}`);
	}
}

/** Generate SVG for a nested SVG tag */
async function generateNestedSvgTag(
	tag: NestedSvgTag,
	context: SvgGenerationContext,
	path: string,
): Promise<string> {
	try {
		// Resolve SVG path relative to current directory
		const resolvedPath = resolvePath(context, tag.svgPath);

		// Fetch SVG file
		const fileContent = context.filesystem.load(resolvedPath);

		// Convert bytes to text
		let svgText = new TextDecoder().decode(fileContent.bytes);

		// Remove XML header if present
		svgText = svgText.replace(/^\s*<\?xml.*?\?>/i, "").trim();

		// Wrap in group with attributes.
		//
		// The file's contents are spliced in unparsed, so anything inside is
		// foreign and may carry its own `data-clgn-*`. The group is marked
		// opaque so the editor never trusts a path found within it.
		return writeTag("g", annotated(tag.attrs, context, path, true), svgText);
	} catch (error) {
		throw new XmlError(
			`Failed to process nested SVG at ${tag.svgPath}: ${String(error)}`,
		);
	}
}

/** Generate SVG for any child tag */
async function generateAnyChildTag(
	tag: AnyChildTag,
	context: SvgGenerationContext,
	path: string,
): Promise<string> {
	switch (tag.type) {
		case "generic":
			return generateGenericTag(tag, context, path);
		case "text":
			return generateTextTag(tag, context);
		case "image":
			return generateImageTag(tag, context, path);
		case "container":
			return generateContainerTag(tag, context, path);
		case "font":
			return generateFontTag(tag, context, path);
		case "nested-svg":
			return generateNestedSvgTag(tag, context, path);
		default: {
			// TypeScript exhaustiveness check
			const _exhaustive: never = tag;
			throw new Error(
				`Unknown tag type: ${(_exhaustive as unknown as AnyChildTag).type}`,
			);
		}
	}
}

// =============================================================================
// Root SVG Generation
// =============================================================================

/** Generate complete SVG document from root tag */
export async function generateSvg(
	rootTag: RootTag,
	filesystem: InMemoryFileSystem,
	options: { annotate?: boolean } = {},
): Promise<string> {
	const context: SvgGenerationContext = {
		filesystem,
		currentDir: "", // Start at root directory
		annotate: options.annotate,
	};

	// Ensure xmlns attribute is present
	const svgAttrs: XmlAttrs = {
		xmlns: "http://www.w3.org/2000/svg",
		...rootTag.attrs,
	};

	const content = await generateChildren(rootTag.children, context, "");
	return writeTag("svg", annotated(svgAttrs, context, ""), content);
}

// =============================================================================
// Container Tag Helpers
// =============================================================================

/** Create a nested filesystem context for a container tag */
function createNestedContext(
	parentContext: SvgGenerationContext,
	relativePath: string,
): SvgGenerationContext {
	// The filesystem is shared, not re-rooted at the container. Copying only the
	// files beneath the container would sandbox it, and a nested manifest could
	// then no longer import anything above itself — `random-gibberish` imports a
	// library shared across the whole skeleton exactly that way. Paths stay
	// resolvable because `currentDir` tracks where we are instead.
	return { filesystem: parentContext.filesystem, currentDir: relativePath };
}

// =============================================================================
// Helper Functions
// =============================================================================

// TODO: delete this and treat no SVG tags as self closing
/** Check if a tag should be self-closing when empty */
function isSelfClosingTag(tagName: string): boolean {
	const selfClosingTags = new Set([
		"area",
		"base",
		"br",
		"col",
		"embed",
		"hr",
		"img",
		"input",
		"link",
		"meta",
		"param",
		"source",
		"track",
		"wbr",
		// SVG self-closing tags
		"circle",
		"ellipse",
		"line",
		"path",
		"polygon",
		"polyline",
		"rect",
		"stop",
		"use",
	]);

	return selfClosingTags.has(tagName);
}

/** Infer image kind from file path */
function inferImageKind(imagePath: string): string {
	const ext = imagePath.split(".").pop()?.toLowerCase();

	switch (ext) {
		case "jpg":
		case "jpeg":
			return "jpeg";
		case "png":
			return "png";
		case "gif":
			return "gif";
		case "webp":
			return "webp";
		case "bmp":
			return "bmp";
		case "svg":
			return "svg+xml";
		default:
			return "png"; // Default fallback
	}
}

/** Get bundled font data (placeholder - would be populated with actual fonts) */
async function getBundledFontDataBase64(fontName: string): Promise<string> {
	const fontUrls: Record<string, string> = { IMPACT: impactB64Url };
	const fontBase64File: string | undefined = fontUrls[fontName.toUpperCase()];

	if (fontBase64File === undefined) {
		throw new BundledFontNotFoundError(fontName);
	}

	// Check if the font is already a data URL (e.g., when bundled by esbuild)
	if (impactB64Url.startsWith("data:")) {
		const base64Start = impactB64Url.indexOf("base64,");
		if (base64Start !== -1) {
			return impactB64Url.slice(base64Start + 7);
		}
	}

	let fontBuffer;

	if (import.meta.env?.MODE === "test") {
		const { readFile } = await import("node:fs/promises");
		const path = await import("node:path");

		fontBuffer = (await readFile(
			path.join(process.cwd(), impactB64Url),
		)) as Uint8Array<ArrayBuffer>;
	} else {
		fontBuffer = await fetch(impactB64Url).then(resp => resp.bytes());
	}

	const fontDataB64 = base64Encode(fontBuffer);

	return fontDataB64;
}
