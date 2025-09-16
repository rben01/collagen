import { normalizedPathJoin } from "$lib/collagen-ts/filesystem";
import { getCommonPathPrefix, base64Decode } from "$lib/collagen-ts/utils";
import { isPlainObject } from "$lib/collagen-ts/validation";

/* Get root folder name from a list of filenames
 *
 * Precondition: filenames have already had `normalizedPathJoin` called on them
 */
export function getRootFolderName(filenames: string[]) {
	if (filenames.length === 1) {
		const parent = filenames[0].match(/(.*)\/.*$/);
		return parent?.[1] ?? "";
	} else {
		return getCommonPathPrefix(filenames);
	}
}

export function stripFolderPrefix(
	fileData: Map<string, File>,
	rootFolderName: string,
) {
	if (!rootFolderName) return fileData;
	const stripped = new Map<string, File>();
	const rootLen = rootFolderName.length;
	for (const [path, file] of fileData) {
		if (path.startsWith(rootFolderName)) {
			stripped.set(path.substring(rootLen), file);
		} else {
			// If paths don't share the root, return original map as-is
			return fileData;
		}
	}
	return stripped;
}

async function expandClgnFileInto(
	clgnFile: File,
	fileMap: Map<string, File>,
): Promise<void> {
	const text = await clgnFile.text();
	const data = JSON.parse(text);

	// Validate JSON is a plain object
	if (!isPlainObject(data)) {
		throw new Error("Invalid .clgn file: root must be an object");
	}

	// Validate files field exists and is a plain object
	if (!data.files) {
		throw new Error("Invalid .clgn file: missing 'files' field");
	}
	if (!isPlainObject(data.files)) {
		throw new Error("Invalid .clgn file: 'files' field must be an object");
	}

	// Validate each entry
	for (const [path, base64Data] of Object.entries(data.files)) {
		// Validate filename is not empty
		if (path === "") {
			throw new Error("Invalid .clgn file: filename cannot be empty");
		}

		// Validate value is a string
		if (typeof base64Data !== "string") {
			throw new Error(
				`Invalid .clgn file: value for '${path}' must be a string`,
			);
		}

		// Process the file
		const bytes = base64Decode(base64Data);
		const filename = path.split("/").pop()!;
		const file = new File([bytes], filename);
		fileMap.set(normalizedPathJoin(path), file);
	}
}

async function addFileToMap(
	file: File,
	fullPath: string,
	fileMap: Map<string, File>,
) {
	if (file.name.endsWith(".clgn")) {
		await expandClgnFileInto(file, fileMap);
	} else {
		fileMap.set(normalizedPathJoin(fullPath), file);
	}
}

function addEntryAndChildrenToMap(
	entry: FileSystemEntry,
	fileMap: Map<string, File>,
) {
	return new Promise<void>((resolve, reject) => {
		if (entry.isFile) {
			const timeout = setTimeout(
				() => reject(new Error("Timeout processing entry")),
				1000,
			);
			const entryFile = entry as FileSystemFileEntry;
			entryFile.file(
				file => {
					addFileToMap(file, entryFile.fullPath, fileMap)
						.then(resolve)
						.catch(reject)
						.finally(() => clearTimeout(timeout));
				},
				err => {
					clearTimeout(timeout);
					reject(err);
				},
			);
		} else if (entry.isDirectory) {
			const entryDirectory = entry as FileSystemDirectoryEntry;
			const reader = entryDirectory.createReader();
			const readAllEntries = () => {
				reader.readEntries(
					entries => {
						if (entries.length === 0) {
							resolve();
							return;
						}
						Promise.all(
							entries.map(e => addEntryAndChildrenToMap(e, fileMap)),
						)
							.then(readAllEntries)
							.catch(reject);
					},
					err => reject(err),
				);
			};
			readAllEntries();
		} else {
			reject(new Error("Unknown entry type"));
		}
	});
}

export async function collectFromDataTransfer(items: DataTransferItemList) {
	const fileMap = new Map<string, File>();
	const itemsToProcess: Array<
		{ type: "entry"; data: FileSystemEntry } | { type: "file"; data: File }
	> = [];

	for (let i = 0, len = items.length; i < len; i++) {
		const item = items[i];
		if (item.kind === "file") {
			const entry = item.webkitGetAsEntry();
			if (entry) {
				itemsToProcess.push({ type: "entry", data: entry });
			} else {
				const file = item.getAsFile();
				if (file) {
					itemsToProcess.push({ type: "file", data: file });
				}
			}
		}
	}

	for (const item of itemsToProcess) {
		if (item.type === "entry") {
			await addEntryAndChildrenToMap(item.data, fileMap);
		} else {
			addFileToMap(item.data, item.data.name, fileMap);
		}
	}

	const root = getRootFolderName([...fileMap.keys()]);
	return { fileMap, root };
}

export async function collectFromFileList(fileList: FileList) {
	const fileMap = new Map<string, File>();
	for (const file of fileList) {
		const path = file.webkitRelativePath || file.name;
		addFileToMap(file, path, fileMap);
	}
	const root = getRootFolderName([...fileMap.keys()]);
	return { fileMap, root };
}
