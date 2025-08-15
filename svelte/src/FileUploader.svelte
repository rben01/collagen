<script>
	import { createEventDispatcher } from "svelte";

	export let disabled = false;

	const dispatch = createEventDispatcher();

	let dragOver = false;
	let files = null;

	function handleDrop(event) {
		event.preventDefault();
		dragOver = false;

		console.log("📥 Drop event received");

		if (disabled) {
			console.log("❌ Drop ignored - component disabled");
			return;
		}

		const items = event.dataTransfer.items;
		console.log("📁 Items in drop:", items.length);
		processFiles(items);
	}

	function handleDragOver(event) {
		event.preventDefault();
		if (!disabled) {
			dragOver = true;
		}
	}

	function handleDragLeave() {
		dragOver = false;
	}

	function handleFileInput(event) {
		if (disabled) return;

		const fileInput = event.target;
		if (fileInput.files.length > 0) {
			const files = Array.from(fileInput.files);
			processFileList(files);
		}
	}

	async function processFiles(items) {
		console.log("🔄 Processing files...");
		const fileData = {};
		let rootFolderName = null;

		try {
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				console.log(`📋 Item ${i}: kind=${item.kind}, type=${item.type}`);
				if (item.kind === "file") {
					const entry = item.webkitGetAsEntry();
					if (entry) {
						console.log(
							`📂 Entry: name=${entry.name}, isDirectory=${entry.isDirectory}`,
						);
						// Capture root folder name from first directory entry
						if (entry.isDirectory && rootFolderName === null) {
							rootFolderName = entry.name;
							console.log("📁 Root folder detected:", rootFolderName);
						}
						await processEntry(entry, "", fileData, rootFolderName);
					}
				}
			}

			console.log("📊 Raw file data keys:", Object.keys(fileData));
			console.log("📂 Root folder name:", rootFolderName);

			// Strip root folder prefix from all paths if we detected one
			const cleanedFileData = stripFolderPrefix(fileData, rootFolderName);

			console.log(
				"✨ Cleaned file data keys:",
				Object.keys(cleanedFileData),
			);

			files = cleanedFileData;
			dispatch("files-uploaded", {
				files: cleanedFileData,
				folderName: rootFolderName,
			});
		} catch (error) {
			console.error("❌ Error processing files:", error);
			// You might want to dispatch an error event here
			// dispatch('error', { message: error.message });
		}
	}

	function processFileList(fileList) {
		const fileData = {};
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
		const cleanedFileData = stripFolderPrefix(fileData, rootFolderName);

		files = cleanedFileData;
		dispatch("files-uploaded", {
			files: cleanedFileData,
			folderName: rootFolderName,
		});
	}

	function processEntry(entry, path, fileData, rootFolderName = null) {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				console.error("⏰ Timeout processing entry:", entry.name);
				reject(new Error(`Timeout processing entry: ${entry.name}`));
			}, 30000); // 30 second timeout

			if (entry.isFile) {
				console.log(`📄 Processing file: ${entry.name}`);
				entry.file(
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
				console.log(`📁 Processing directory: ${entry.name}`);
				const reader = entry.createReader();
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
		dispatch("clear");
	}

	function stripFolderPrefix(fileData, rootFolderName) {
		if (!rootFolderName) {
			return fileData;
		}

		const cleanedData = {};
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

	function openFolderPicker() {
		if (disabled) return;

		const input = document.createElement("input");
		input.type = "file";
		input.webkitdirectory = true;
		input.multiple = true;
		input.style.display = "none";

		input.addEventListener("change", e => {
			if (e.target.files.length > 0) {
				const files = Array.from(e.target.files);
				processFileList(files);
			}
			document.body.removeChild(input);
		});

		document.body.appendChild(input);
		input.click();
	}
</script>

<div class="uploader">
	<div
		class="drop-zone"
		class:drag-over={dragOver}
		class:disabled
		on:drop={handleDrop}
		on:dragover={handleDragOver}
		on:dragleave={handleDragLeave}
	>
		{#if !files}
			<div class="upload-content">
				<div class="upload-icon">📁</div>
				<h3>Upload Collagen Project Folder</h3>
				<p>
					Drag and drop a folder containing your collagen.json or
					collagen.jsonnet manifest
				</p>
				<button class="browse-btn" on:click={openFolderPicker} {disabled}>
					Browse for Folder
				</button>
				<div class="supported-formats">
					<small
						>Supported: .json, .jsonnet, .png, .jpg, .svg, and more</small
					>
				</div>
			</div>
		{:else}
			<div class="files-uploaded">
				<div class="upload-success">
					<span class="success-icon">✅</span>
					<span>Folder uploaded successfully!</span>
				</div>
				<button class="clear-btn" on:click={handleClear}>
					Upload Different Folder
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
		margin-bottom: 1.5em;
		line-height: 1.5;
	}

	.upload-icon {
		font-size: 3em;
		margin-bottom: 0.5em;
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

	.supported-formats {
		color: #9ca3af;
		font-size: 0.9em;
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
