<script lang="ts">
	let {
		disabled = false,
		handleFilesUploaded,
		handleClearFiles,
		externalError = null,
	} = $props<{
		disabled: boolean;
		handleFilesUploaded: (
			files: Record<string, File>,
			root: string,
		) => Promise<void>;
		handleClearFiles: () => void;
		externalError?: string | null;
	}>();

	let dragOver = $state(false);
	let files: Record<string, File> | null = $state(null);
	let errorMessage = $state<string | null>(null);
	let isFileUpload = $state(false); // Track if it's a single file vs folder

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragOver = false;

		console.log("📥 Drop event received");

		if (disabled) {
			console.log("❌ Drop ignored - component disabled");
			return;
		}

		const items = event.dataTransfer!.items;
		console.log("📁 Items in drop:", items.length);
		processFiles(items);
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

	async function processFiles(items: DataTransferItemList) {
		console.log("🔄 Processing files...");

		// Clear any previous error
		errorMessage = null;

		// Check if multiple items were dropped
		if (items.length > 1) {
			errorMessage = "Please drop only one file or folder at a time.";
			return;
		}

		const fileData = {};
		let rootFolderName = null;

		try {
			for (let i = 0, len = items.length; i < len; i++) {
				const item = items[i];
				console.log(`📋 Item ${i}: kind=${item.kind}, type=${item.type}`);
				// meaning we dragged a file, not some text
				if (item.kind === "file") {
					const entry = item.webkitGetAsEntry();
					if (entry) {
						console.log(
							`📂 Entry: name=${entry.name}, isDirectory=${entry.isDirectory}`,
						);

						// If it's a single file, validate its type
						if (!entry.isDirectory) {
							const validExtensions = [".json", ".jsonnet"];
							const extension = entry.name
								.toLowerCase()
								.substring(entry.name.lastIndexOf("."));

							if (!validExtensions.includes(extension)) {
								errorMessage = `"${entry.name}" is not a supported file type. Please select a JSON (.json) or Jsonnet (.jsonnet) file.`;
								return;
							}

							// Mark as file upload
							isFileUpload = true;
						} else {
							// Mark as folder upload
							isFileUpload = false;
						}

						// Capture root folder name from first directory entry
						if (entry.isDirectory && rootFolderName === null) {
							rootFolderName = entry.name;
							console.log("📁 Root folder detected:", rootFolderName);
						}
						await processEntry(entry, "", fileData, rootFolderName!);
					}
				}
			}

			console.log("📊 Raw file data keys:", Object.keys(fileData));
			console.log("📂 Root folder name:", rootFolderName);

			// Strip root folder prefix from all paths if we detected one
			const cleanedFileData = stripFolderPrefix(fileData, rootFolderName!);

			console.log(
				"✨ Cleaned file data keys:",
				Object.keys(cleanedFileData),
			);

			files = cleanedFileData;
			handleFilesUploaded(cleanedFileData, rootFolderName);
		} catch (error) {
			console.error("❌ Error processing files:", error);
			errorMessage = `Error processing files: ${error instanceof Error ? error.message : "Unknown error"}`;
		}
	}

	function processFileList(fileList: FileList) {
		// Clear any previous error since we're processing valid files
		errorMessage = null;

		const fileData: { [k: string]: File } = {};
		let rootFolderName = null;

		for (const file of fileList) {
			// Extract relative path from webkitRelativePath or use file name
			const path = file.webkitRelativePath || file.name;

			// Extract root folder name from first file with webkitRelativePath
			if (file.webkitRelativePath && rootFolderName === null) {
				const pathParts = file.webkitRelativePath.split("/");
				if (pathParts.length > 1) {
					rootFolderName = pathParts[0];
				}
			}

			fileData[path] = file;
		}

		// Strip root folder prefix from all paths if we detected one
		const cleanedFileData = stripFolderPrefix(fileData, rootFolderName!);

		files = cleanedFileData;
		handleFilesUploaded(cleanedFileData, rootFolderName);
	}

	function processEntry(
		entry: FileSystemEntry,
		path: string,
		fileData: Record<string, File>,
		rootFolderName: string | null = null,
	) {
		return new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => {
				console.error("⏰ Timeout processing entry:", entry.name);
				reject(new Error(`Timeout processing entry: ${entry.name}`));
			}, 30000); // 30 second timeout

			if (entry.isFile) {
				let entryFile = entry as FileSystemFileEntry;
				console.log(`📄 Processing file: ${entry.name}`);
				entryFile.file(
					file => {
						const fullPath = path ? `${path}/${entry.name}` : entry.name;
						console.log(
							`✅ File processed: ${fullPath} (${file.size} bytes)`,
						);
						fileData[fullPath] = file;
						clearTimeout(timeout);
						resolve();
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
				reader.readEntries(
					entries => {
						console.log(
							`📋 Directory ${entry.name} has ${entries.length} entries`,
						);
						const promises = entries.map(childEntry => {
							const childPath = path
								? `${path}/${entry.name}`
								: entry.name;
							return processEntry(
								childEntry,
								childPath,
								fileData,
								rootFolderName,
							);
						});
						Promise.all(promises)
							.then(() => {
								console.log(`✅ Directory processed: ${entry.name}`);
								clearTimeout(timeout);
								resolve();
							})
							.catch(error => {
								console.error(
									`❌ Error processing directory ${entry.name}:`,
									error,
								);
								clearTimeout(timeout);
								reject(error);
							});
					},
					error => {
						console.error(
							`❌ Error reading directory ${entry.name}:`,
							error,
						);
						clearTimeout(timeout);
						reject(error);
					},
				);
			} else {
				console.log(`⚠️ Unknown entry type: ${entry.name}`);
				clearTimeout(timeout);
				resolve();
			}
		});
	}

	function handleClear() {
		files = null;
		errorMessage = null;
		isFileUpload = false;
		handleClearFiles();
	}

	function stripFolderPrefix(
		fileData: Record<string, File>,
		rootFolderName: string,
	) {
		if (!rootFolderName) {
			return fileData;
		}

		const cleanedData: Record<string, File> = {};
		const prefix = rootFolderName + "/";

		for (const [path, file] of Object.entries(fileData)) {
			if (path.startsWith(prefix)) {
				const cleanedPath = path.substring(prefix.length);
				if (cleanedPath) {
					// Skip empty paths
					cleanedData[cleanedPath] = file;
				}
			} else {
				// Keep files that don't have the prefix (shouldn't happen but handle gracefully)
				cleanedData[path] = file;
			}
		}

		return cleanedData;
	}

	function validateAndProcessFiles(fileList: FileList) {
		const validExtensions = [".json", ".jsonnet"];

		// Clear any previous error
		errorMessage = null;

		if (fileList.length !== 1) {
			errorMessage = "Please select only one file at a time.";
			return;
		}

		const file = fileList[0];
		const extension = file.name
			.toLowerCase()
			.substring(file.name.lastIndexOf("."));

		if (!validExtensions.includes(extension)) {
			errorMessage = `"${file.name}" is not a supported file type. Please select a JSON (.json) or Jsonnet (.jsonnet) file.`;
			return;
		}

		// File is valid, mark as file upload and process it
		isFileUpload = true;
		processFileList(fileList);
	}

	function openFolderPicker() {
		if (disabled) return;

		const input = document.createElement("input");
		input.type = "file";
		input.multiple = false;
		input.webkitdirectory = false; // Allow individual files
		input.style.display = "none";

		input.addEventListener("change", e => {
			const files = (e.target! as HTMLInputElement).files!;
			if (files.length > 0) {
				validateAndProcessFiles(files);
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
					<span class="success-icon">✅</span>
					<span
						>{isFileUpload ? "File" : "Folder"} uploaded successfully!</span
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

	.success-icon {
		font-size: 1.2em;
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
