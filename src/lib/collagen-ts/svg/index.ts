/**
 * SVG generation system for Collagen TypeScript implementation
 *
 * This module handles the conversion of validated tag structures into
 * SVG XML output, matching the behavior of the Rust implementation.
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
	baseDepth: number;
	currentDir: string; // Current directory context for resolving relative paths
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
function writeTextContent(text: string, isPreescaped: boolean): string {
	return isPreescaped ? text : escapeXml(text);
}

// =============================================================================
// Tag Generation Functions
// =============================================================================

/** Generate SVG for a generic tag */
async function generateGenericTag(
	tag: GenericTag,
	context: SvgGenerationContext,
): Promise<string> {
	const childrenContent = await Promise.all(
		tag.children.map(child => generateAnyChildTag(child, context)),
	);

	const content = childrenContent.join("");
	const isSelfClosing = content === "" && isSelfClosingTag(tag.tagName);

	return writeTag(tag.tagName, tag.attrs, content, isSelfClosing);
}

/** Generate SVG for a text tag */
async function generateTextTag(
	tag: TextTag,
	_context: SvgGenerationContext,
): Promise<string> {
	return writeTextContent(tag.text, tag.isPreescaped);
}

/** Generate SVG for an image tag */
async function generateImageTag(
	tag: ImageTag,
	context: SvgGenerationContext,
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
		const imageAttrs: XmlAttrs = { ...tag.attrs, href: dataUri };

		// Generate child content
		const childrenContent = await Promise.all(
			tag.children.map(child => generateAnyChildTag(child, context)),
		);

		const content = childrenContent.join("");
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
): Promise<string> {
	try {
		// Resolve container path relative to current directory
		const resolvedPath = resolvePath(context, tag.clgnPath);

		// Create a new filesystem context for the nested folder
		const nestedContext = await createNestedContext(context, resolvedPath);

		const nestedRootTag = await nestedContext.filesystem.generateRootTag();

		// Generate children content (not the full SVG wrapper)
		const childrenContent = await Promise.all(
			nestedRootTag.children.map(child =>
				generateAnyChildTag(child, nestedContext),
			),
		);

		const content = childrenContent.join("");

		// Wrap in a group with the nested root's attributes
		return writeTag("g", nestedRootTag.attrs, content);
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
		return writeTag("defs", tag.attrs, fullStyleContent);
	} catch (error) {
		throw new FontError(`Failed to process fonts: ${String(error)}`);
	}
}

/** Generate SVG for a nested SVG tag */
async function generateNestedSvgTag(
	tag: NestedSvgTag,
	context: SvgGenerationContext,
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

		// Wrap in group with attributes
		return writeTag("g", tag.attrs, svgText);
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
): Promise<string> {
	switch (tag.type) {
		case "generic":
			return generateGenericTag(tag, context);
		case "text":
			return generateTextTag(tag, context);
		case "image":
			return generateImageTag(tag, context);
		case "container":
			return generateContainerTag(tag, context);
		case "font":
			return generateFontTag(tag, context);
		case "nested-svg":
			return generateNestedSvgTag(tag, context);
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
): Promise<string> {
	const context: SvgGenerationContext = {
		filesystem,
		baseDepth: 0,
		currentDir: "", // Start at root directory
	};

	// Ensure xmlns attribute is present
	const svgAttrs: XmlAttrs = {
		xmlns: "http://www.w3.org/2000/svg",
		...rootTag.attrs,
	};

	// Generate children content
	const childrenContent = await Promise.all(
		rootTag.children.map(child => generateAnyChildTag(child, context)),
	);

	const content = childrenContent.join("");
	return writeTag("svg", svgAttrs, content);
}

// =============================================================================
// Container Tag Helpers
// =============================================================================

/** Create a nested filesystem context for a container tag */
async function createNestedContext(
	parentContext: SvgGenerationContext,
	relativePath: string,
): Promise<SvgGenerationContext> {
	// Get all files from parent filesystem that start with the relative path
	const parentPaths = parentContext.filesystem.getPaths();
	const nestedFiles = new Map<string, File>();

	// Find all files that are in the nested folder
	const prefix = relativePath.endsWith("/")
		? relativePath
		: relativePath + "/";

	for (const path of parentPaths) {
		if (path.startsWith(prefix)) {
			// Remove the prefix to make paths relative to the nested folder
			const nestedRelativePath = path.slice(prefix.length);
			if (nestedRelativePath) {
				// Skip the folder itself
				// Get the original file from the parent filesystem
				const fileContent = parentContext.filesystem.load(path);
				// Create a new File object from the content
				const file = new File(
					[new Uint8Array(fileContent.bytes)],
					nestedRelativePath.split("/").pop() || nestedRelativePath,
				);
				nestedFiles.set(nestedRelativePath, file);
			}
		}
	}

	// Create new filesystem with the filtered files
	const nestedFilesystem = await InMemoryFileSystem.create(nestedFiles);

	return {
		filesystem: nestedFilesystem,
		baseDepth: parentContext.baseDepth + 1,
		currentDir: "", // Reset to root for nested context
	};
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

	let fontBuffer;

	if (import.meta.env.MODE === "test") {
		const { readFile } = await import("node:fs/promises");
		const path = await import("node:path");

		fontBuffer = (await readFile(
			path.join(process.cwd(), impactB64Url),
		)) as Uint8Array<ArrayBuffer>;
	} else {
		// TODO we've missed the await here before -- test this
		fontBuffer = await fetch(impactB64Url).then(resp => resp.bytes());
	}

	const fontDataB64 = base64Encode(fontBuffer);

	return fontDataB64;
}
