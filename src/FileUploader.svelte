<script lang="ts">
	import { getCommonPathPrefix } from "./lib/collagen-ts/utils";

	let {
		disabled = false,
		handleFilesUploaded,
		handleClearFiles,
		externalError = null,
	} = $props<{
		disabled: boolean;
		handleFilesUploaded: (
			files: Map<string, File>,
			root: string,
		) => Promise<void>;
		handleClearFiles: () => void;
		externalError?: string | null;
	}>();

	let dragOver = $state(false);
	let files: Map<string, File> | null = $state(null);
	let errorMessage = $state<string | null>(null);
	let nUploadedFiles = $state(0);
	let nUploadedFolders = $state(0);

	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragOver = false;

		console.log("📥 Drop event received");

		if (disabled) {
			console.log("❌ Drop ignored - component disabled");
			return;
		}

		const items = event.dataTransfer!.items;
		console.log("📁 Items in drop:", items.length);
		await processFilesFromDataTransfer(items);
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		if (!disabled) {
			dragOver = true;
		}
	}

	function handleDragLeave() {
		dragOver = false;
	}

	/**
	 * Process files and/or a folder from a drag-and-drop operation.
	 *
	 * Behavior:
	 * - Uses the non‑standard webkitGetAsEntry API to walk directories recursively.
	 * - Populates a Map keyed by relative path -> File and detects a root folder name when present.
	 * - Sets `isFileUpload` to true for single file, false for folder drops.
	 * - Handles all processing internally, including error handling and success callbacks.
	 *
	 * @param items DataTransferItemList from a drop event.
	 */
	async function processFilesFromDataTransfer(items: DataTransferItemList) {
		clearProcessingError();

		try {
			console.log("🔄 Processing files from drag & drop...");

			const fileMap = new Map<string, File>();

			let itemNames: string[] = [];

			// Count top-level folders and individual files
			let topLevelFolders = 0;
			let topLevelFiles = 0;

			// First pass: collect all entries/files synchronously while DataTransferItems
			// are still valid. If you try to handle them one at a time asynchronously, the
			// creation of a separate thread (or whatever) destroys the context in which
			// they were dragged, and all items after the first become invalidated.
			const itemsToProcess: Array<
				| { type: "entry"; data: FileSystemEntry }
				| { type: "file"; data: File }
			> = [];
			for (let i = 0, len = items.length; i < len; i++) {
				const item = items[i];
				console.log(
					`📋 Item ${i}: kind=${item.kind}, name=${item.getAsFile()?.name}, type=${item.type}`,
				);

				// meaning we dragged a file or a folder (they're both "file"), not some text
				if (item.kind === "file") {
					const entry = item.webkitGetAsEntry();

					if (entry) {
						itemNames.push(entry.name);
						console.log(
							`📂 Entry: name=${entry.name}, isDirectory=${entry.isDirectory}`,
						);

						if (entry.isDirectory) {
							topLevelFolders++;
						} else {
							topLevelFiles++;
						}

						itemsToProcess.push({ type: "entry", data: entry });
					} else {
						const file = item.getAsFile();
						if (!file) {
							const message = `could not process file ${item.type}; ${item.kind}`;
							throw new Error(message);
						}

						itemNames.push(file.name);

						topLevelFiles++;
						itemsToProcess.push({ type: "file", data: file });
					}
				}
			}

			nUploadedFolders = topLevelFolders;
			nUploadedFiles = topLevelFiles;

			// Second pass: process everything asynchronously
			for (const item of itemsToProcess) {
				if (item.type === "entry") {
					await addEntryAndChildrenToMap(item.data, "", fileMap);
				} else {
					addFileToMap(item.data, "", fileMap);
				}
			}

			const rootFolderName = getCommonPathPrefix(itemNames);

			console.log("📊 Raw file data size:", fileMap.size, "files");
			console.log("📂 Root folder name:", rootFolderName);

			handleProcessingSuccess(fileMap, rootFolderName);
		} catch (error) {
			handleProcessingError(error);
		}
	}

	async function processFilesFromFileList(fileList: FileList) {
		clearProcessingError();

		try {
			console.log("🔄 Processing files from file picker...");

			const fileMap = new Map<string, File>();

			for (const file of fileList) {
				// Extract relative path from webkitRelativePath or use file name
				const path = file.webkitRelativePath ?? file.name;
				fileMap.set(path, file);
			}

			const rootFolderName = getCommonPathPrefix([...fileMap.keys()], "/");

			// For file picker, we're always dealing with individual files
			nUploadedFiles = fileList.length;
			nUploadedFolders = 0;

			handleProcessingSuccess(fileMap, rootFolderName);
		} catch (error) {
			handleProcessingError(error);
		}
	}

	function addFileToMap(
		file: File,
		path: string,
		fileMap: Map<string, File>,
		resolve?: () => void,
	) {
		const fullPath = path ? `${path}/${file.name}` : file.name;
		console.log(`✅ File processed: ${fullPath} (${file.size} bytes)`);
		fileMap.set(fullPath, file);
		resolve?.();
	}

	function addEntryAndChildrenToMap(
		entry: FileSystemEntry,
		path: string,
		fileMap: Map<string, File>,
	) {
		// entryFile.file uses callbacks, not async, so we have to wrap it in a Promise
		// and use resolve/reject to signal we're done

		return new Promise<void>((resolve, reject) => {
			if (entry.isFile) {
				const timeout = setTimeout(() => {
					console.error("⏰ Timeout processing entry:", entry.name);
					reject(new Error(`Timeout processing entry: ${entry.name}`));
				}, 1000); // 1 second timeout per file (incredibly generous)

				let entryFile = entry as FileSystemFileEntry;
				console.log(`📄 Processing file: ${entry.name}`);
				entryFile.file(
					file => {
						addFileToMap(file, path, fileMap, () => {
							clearTimeout(timeout);
							resolve();
						});
					},
					error => {
						console.error(`❌ Error reading file ${entry.name}:`, error);
						clearTimeout(timeout);
						reject(error);
					},
				);
			} else if (entry.isDirectory) {
				let entryDirectory = entry as FileSystemDirectoryEntry;
				console.log(`📁 Processing directory: ${entry.name}`);
				const reader = entryDirectory.createReader();

				// read entries until there are none left. reader.readEntries doesn't
				// necessarily return *all* files; you may need multiple attempts. but when
				// it returns 0, it's done. and if we're not done, we just continue trying
				// to read (don't resolve until we get entries.length === 0)
				const readAllEntries = () => {
					reader.readEntries(
						entries => {
							console.log(
								`📋 Directory ${entry.name} has ${entries.length} entries`,
							);
							if (entries.length === 0) {
								resolve();
								return;
							}
							const handleChildrenPromises = entries.map(childEntry => {
								const childPath = path
									? `${path}/${entry.name}`
									: entry.name;
								return addEntryAndChildrenToMap(
									childEntry,
									childPath,
									fileMap,
								);
							});
							Promise.all(handleChildrenPromises)
								.then(() => {
									console.log(
										`✅ Directory batch processed: ${entry.name}`,
									);
									readAllEntries();
								})
								.catch(error => {
									console.error(
										`❌ Error processing directory ${entry.name}:`,
										error,
									);
									reject(error);
								});
						},
						error => {
							console.error(
								`❌ Error reading directory ${entry.name}:`,
								error,
							);
							reject(error);
						},
					);
				};

				readAllEntries();
			} else {
				errorMessage = `⚠️ Unknown entry type: ${entry.name}`;
				throw new Error(errorMessage);
			}
		});
	}

	function handleClear() {
		files = null;
		errorMessage = null;
		nUploadedFiles = 0;
		nUploadedFolders = 0;
		handleClearFiles();
	}

	function stripFolderPrefix(
		fileData: Map<string, File>,
		rootFolderName: string,
	) {
		if (!rootFolderName) {
			return fileData;
		}

		const strippedFileMap = new Map<string, File>();
		const rootLen = rootFolderName.length;

		for (const [path, file] of fileData) {
			if (path.startsWith(rootFolderName)) {
				const cleanedPath = path.substring(rootLen);
				strippedFileMap.set(cleanedPath, file);
			} else {
				errorMessage = `tried to strip prefix ${rootFolderName} from ${path}, but no such prefix found`;
				console.warn(errorMessage);
				throw new Error(errorMessage);
			}
		}

		return strippedFileMap;
	}

	function clearProcessingError() {
		errorMessage = null;
	}

	function handleProcessingSuccess(
		fileMap: Map<string, File>,
		rootFolderName: string,
	) {
		const cleanedFileMap = stripFolderPrefix(fileMap, rootFolderName);

		console.log("✨ Cleaned file data size:", cleanedFileMap.size, "files");

		files = cleanedFileMap;
		handleFilesUploaded(cleanedFileMap, rootFolderName);
	}

	function handleProcessingError(error: unknown) {
		console.error("❌ Error processing files:", error);
		errorMessage = `Error processing files: ${error instanceof Error ? error.message : "Unknown error"}`;
	}

	function openFolderPicker() {
		if (disabled) return;

		// TODO: allow multiple
		const input = document.createElement("input");
		input.setAttribute("id", "file-input-hidden");
		input.type = "file";
		input.multiple = false;
		input.webkitdirectory = false; // Allow individual files
		input.style.display = "none";

		input.addEventListener("change", e => {
			const files = (e.target! as HTMLInputElement).files!;
			if (files.length > 0) {
				processFilesFromFileList(files);
			}
			document.body.removeChild(input);
		});

		document.body.appendChild(input);
		input.click();
	}

	function handleGlobalKeydown(event: KeyboardEvent) {
		// Only trigger if no specific element is focused or if focus is on body
		const activeElement = document.activeElement;
		if (
			(activeElement === document.body || activeElement === null) &&
			(event.key === "o" || event.key === "O") &&
			!disabled
		) {
			event.preventDefault();
			openFolderPicker();
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="uploader">
	<div
		class="drop-zone"
		class:drag-over={dragOver}
		class:disabled
		ondrop={handleDrop}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		onclick={openFolderPicker}
		role="button"
		aria-label="File upload drop zone - drag and drop files, click to browse, or press Enter when focused"
		title="Drop files here or click to browse (Enter when focused, O when nothing is focused)"
		tabindex="0"
		onkeydown={e =>
			(e.key === "Enter" || e.key === " ") && !disabled
				? (e.preventDefault(), openFolderPicker())
				: null}
	>
		{#if errorMessage || externalError}
			<div class="error-message">
				<span class="error-icon">⚠️</span>
				{errorMessage || externalError}
			</div>
		{/if}

		{#if !files}
			<div class="upload-content">
				<h3>Upload Collagen Project</h3>
				<p>
					Drag and drop a <code>collagen.json</code> or a
					<code>collagen.jsonnet</code> manifest file, or a folder
					containing one of those and any other resources. Or press O to
					<em>open</em> the file/folder picker.
				</p>

				<button
					class="browse-btn"
					onclick={e => {
						e.stopPropagation();
						openFolderPicker();
					}}
					onkeydown={e => {
						if (e.key === "Enter" && !disabled) {
							e.preventDefault();
							e.stopPropagation();
							openFolderPicker();
						}
					}}
					title="Browse for file or folder (Enter to open when focused, O when nothing is focused)"
					aria-label="Browse for file or folder - press Enter to open file picker"
					{disabled}
				>
					Browse
				</button>
			</div>
		{:else}
			<div class="files-uploaded">
				<div class="upload-success">
					<span
						>{nUploadedFiles === 0
							? nUploadedFolders === 1
								? "Folder"
								: "Folders"
							: nUploadedFolders === 0
								? nUploadedFiles === 1
									? "File"
									: "Files"
								: "Items"} uploaded successfully.</span
					>
				</div>
				<button class="clear-btn" onclick={handleClear}>
					Upload Another Project
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.uploader {
		width: 100%;
	}

	.drop-zone {
		border: 2px dashed #d1d5db;
		border-radius: 1em;
		padding: 3em 2em;
		text-align: center;
		background: #fafafa;
		transition: all 0.3s ease;
		cursor: pointer;
	}

	.drop-zone:hover:not(.disabled) {
		border-color: #2563eb;
		background: #eff6ff;
	}

	.drop-zone:focus {
		outline: 2px solid #2563eb;
		outline-offset: 2px;
		border-color: #2563eb;
		background: #eff6ff;
	}

	.drop-zone.drag-over {
		border-color: #2563eb;
		background: #dbeafe;
		transform: scale(1.02);
	}

	.drop-zone.disabled {
		opacity: 0.5;
		cursor: not-allowed;
		background: #f5f5f5;
	}

	.upload-content h3 {
		margin: 1em 0 0.5em 0;
		color: #374151;
		font-size: 1.3em;
	}

	.upload-content p {
		color: #6b7280;
		margin: auto;
		margin-bottom: 1.5em;
		line-height: 1.5;
		max-width: min(80%, 640px);
	}

	.error-message {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
		padding: 0.75em 1em;
		border-radius: 0.5em;
		margin: 1em auto;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5em;
		font-size: 0.9em;
		line-height: 1.4;
		width: fit-content;
		max-width: calc(100% - 2em);
	}

	.error-icon {
		font-size: 1.1em;
		flex-shrink: 0;
	}

	.browse-btn {
		background: #2563eb;
		color: white;
		border: none;
		padding: 0.75em 1.5em;
		border-radius: 0.5em;
		font-size: 1em;
		cursor: pointer;
		transition: background-color 0.2s;
		margin-bottom: 1em;
	}

	.browse-btn:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.browse-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.files-uploaded {
		padding: 1em;
	}

	.upload-success {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5em;
		margin-bottom: 1em;
		color: #059669;
		font-size: 1.1em;
		font-weight: 500;
	}

	.clear-btn {
		background: #6b7280;
		color: white;
		border: none;
		padding: 0.5em 1em;
		border-radius: 0.5em;
		font-size: 0.9em;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.clear-btn:hover {
		background: #4b5563;
	}
</style>
