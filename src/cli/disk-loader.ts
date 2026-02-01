import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { InMemoryFileSystem } from "../lib/collagen-ts/index.js";

export async function loadFromDisk(
	inputPath: string,
): Promise<InMemoryFileSystem> {
	const fs = InMemoryFileSystem.createEmpty();
	await loadDirectory(fs, inputPath, inputPath);
	return fs;
}

async function loadDirectory(
	fs: InMemoryFileSystem,
	basePath: string,
	currentPath: string,
): Promise<void> {
	const entries = await readdir(currentPath, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = join(currentPath, entry.name);
		const relativePath = relative(basePath, fullPath);
		if (entry.isDirectory()) {
			await loadDirectory(fs, basePath, fullPath);
		} else if (entry.isFile()) {
			const bytes = await readFile(fullPath);
			fs.addFileContents(relativePath, new Uint8Array(bytes));
		}
	}
}
