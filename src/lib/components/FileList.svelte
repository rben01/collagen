<script lang="ts">
	import {
		collectFromDataTransfer,
		collectFromFileList,
		stripFolderPrefix,
		type FileUploadError,
	} from "$lib/collagen-ts/filesystem/upload";
	import {
		InMemoryFileSystem,
		isTextPath,
		isImagePath,
		type FileContent,
	} from "$lib/collagen-ts/index.js";
	import { formatFileSize, MB } from "$lib/collagen-ts/utils";
	import ButtonIcon from "./ButtonIcon.svelte";
	import ControlButton from "./ControlButton.svelte";
	import Toolbar from "./Toolbar.svelte";

	let {
		filesData = $bindable(),
		handleOpenTextFile,
		handleOpenImageFile,
		handleUploadErrors,
		handleCloseEditor,
		handleCloseImage,
		editorPath,
		imagePath,
	}: {
		filesData: { fs: InMemoryFileSystem };
		handleOpenTextFile: (path: string) => void;
		handleOpenImageFile: (path: string) => void;
		handleUploadErrors: (errors: FileUploadError[]) => void;
		handleCloseEditor: (persist: boolean) => void;
		handleCloseImage: () => void;
		editorPath: string | null;
		imagePath: string | null;
	} = $props();

	const largeFileSizeWarningThreshold = 2 * MB;
	const largeTotalSizeWarningThreshold = 16 * MB;

	// TODO: this is kind of expensive? should we maintain the sorted array and use binary
	// search to insert/delete?
	const filesSorted = $derived.by(() => {
		if (!filesData) {
			return [];
		}
		return Array.from(filesData.fs.files.entries()).sort(
			([path1, _fc1], [path2, _fc2]) => path1.localeCompare(path2),
		);
	});

	// Calculate file statistics
	const fileStats = $derived.by(() => {
		if (!filesData) {
			return { totalSize: 0, warnings: [] };
		}

		let totalSize = 0;
		const largeFiles: FileContent[] = [];

		for (const file of filesData.fs.files.values()) {
			if (file && typeof file.bytes.length === "number") {
				totalSize += file.bytes.length;
				if (file.bytes.length > largeFileSizeWarningThreshold) {
					largeFiles.push(file);
				}
			}
		}

		const warnings = [];

		if (totalSize > largeTotalSizeWarningThreshold) {
			warnings.push({
				type: "warning",
				message: `Total size: ${formatFileSize(totalSize)}. You may start to run into memory issues.`,
			});
		}

		if (largeFiles.length > 0) {
			warnings.push({
				type: "info",
				message: `${largeFiles.length} large file(s) detected.`,
			});
		}

		return { totalSize, warnings };
	});

	// Unified trash system
	interface TrashedFile {
		file: FileContent;
		path: string;
	}

	const TRASH_UNDO_TIME = 5000; // milliseconds
	let trashedFiles: TrashedFile[] = $state([]);
	let countdownInterval: NodeJS.Timeout | null = $state(null);
	let countdownValue = $state(TRASH_UNDO_TIME);
	let dragOver = $state(false);
	let uploading = $state(false);

	$effect(() => {
		if (countdownValue <= 0) {
			trashedFiles = [];
			if (countdownInterval) clearInterval(countdownInterval);
			countdownInterval = null;
		}
	});

	async function handleFilesUploaded(files: Map<string, File>, root: string) {
		console.log("🔄 Starting file processing...");

		console.log("📁 Files received:", files.size, "files");
		if (root) {
			console.log("📂 Root folder:", root);
		}

		let { fs } = filesData;
		if (filesData) {
			console.log("📂 Merging files into existing filesystem...");
			await fs.mergeFiles(files);
		} else {
			// First upload - create new filesystem
			fs = await InMemoryFileSystem.create(files);
		}
		filesData = { fs };

		// If a file was uploaded that matches the currently open editor file, refresh the editor
		if (editorPath && files.has(editorPath)) {
			handleOpenTextFile(editorPath);
		}
	}

	function handleDragEnter(event: DragEvent) {
		event.preventDefault();
		dragOver = true;
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		dragOver = true;
	}

	function handleDragLeave() {
		dragOver = false;
	}

	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragOver = false;
		if (!event.dataTransfer) return;
		handleUploadErrors([]);
		try {
			const { fileMap, root, errors } = await collectFromDataTransfer(
				event.dataTransfer.items,
			);
			const cleaned = stripFolderPrefix(fileMap, root);
			await handleFilesUploaded(cleaned, root);
			handleUploadErrors(errors);
		} catch (error) {
			console.error("Error processing files:", error);
			handleUploadErrors([
				{
					path: null,
					message:
						error instanceof Error ? error.message : "Unknown error",
				},
			]);
		}
	}

	// Handle file deletion
	async function deleteFile(path: string) {
		if (path === editorPath) handleCloseEditor(false);
		if (path === imagePath) handleCloseImage();

		const { fs } = filesData;
		const removedFile = fs.removeFile(path);
		filesData = { fs };
		if (removedFile) {
			// Add to trash
			trashedFiles.push({ file: removedFile, path });

			// Reset the shared timer
			if (countdownInterval) {
				clearInterval(countdownInterval);
			}

			// Start new countdown
			countdownValue = TRASH_UNDO_TIME;
			const startTime = Date.now();

			countdownInterval = setInterval(() => {
				const elapsed = Date.now() - startTime;
				countdownValue = TRASH_UNDO_TIME - elapsed;
			}, 250);
		}
	}

	// Handle undo - restore all trashed files
	async function undoAllDeletions() {
		if (countdownInterval) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}

		// Re-add all files to filesystem
		for (const { file, path } of trashedFiles) {
			filesData.fs.addFileContents(path, file.bytes, true);
		}

		// Clear trash and trigger reactivity
		trashedFiles = [];

		filesData = { fs: filesData.fs };
	}

	function maybeOpen(path: string) {
		if (isTextPath(path)) {
			handleOpenTextFile(path);
		} else if (isImagePath(path)) {
			handleOpenImageFile(path);
		}
	}

	async function openFilePicker() {
		if (uploading) return;

		const input = document.createElement("input");
		input.type = "file";
		input.multiple = true;
		input.webkitdirectory = false;
		input.style.display = "none";

		input.addEventListener("change", async e => {
			const files = (e.target as HTMLInputElement).files;
			if (files && files.length > 0) {
				uploading = true;
				try {
					handleUploadErrors([]);
					const { fileMap, root, errors } =
						await collectFromFileList(files);
					const cleaned = stripFolderPrefix(fileMap, root);
					await handleFilesUploaded(cleaned, root);
					handleUploadErrors(errors);
				} catch (error) {
					console.error("Error processing files:", error);
					handleUploadErrors([
						{
							path: null,
							message:
								error instanceof Error
									? error.message
									: "Unknown error",
						},
					]);
				} finally {
					uploading = false;
				}
			}
			document.body.removeChild(input);
		});

		document.body.appendChild(input);
		input.click();
	}

	async function createNewFile() {
		if (uploading) return;

		const filename = window.prompt("Enter filename:", "collagen.jsonnet");

		if (!filename) return; // User cancelled

		// Basic filename validation
		const trimmed = filename.trim();
		if (!trimmed) {
			alert("Filename cannot be empty");
			return;
		}

		// Check if file already exists
		if (filesData.fs.files.has(trimmed)) {
			const overwrite = window.confirm(
				`File "${trimmed}" already exists. Do you want to overwrite it?`,
			);
			if (!overwrite) return;
		}

		const initialContents = filename.toUpperCase().endsWith(".JSONNET")
			? `
// set up our file-wide constants
local w = 100;
local h = 80;
local margin = 10;
local rectWidth = w - 2 * margin;
local rectHeight = h - 2 * margin;
local nCircles = 5;

// define function with default args
local circleFill(i, n=nCircles) =
		// string formatting. %% to escape percent signs
		"hsl(%d 90%% 50%%)" % (0.2 * (n - i - 1) * 360 / n);

local diameter(r) = 2 * std.pi * r;

{
	attrs: {
		viewBox: "0 0 %d %d" % [w, h],
	},
	// adding lists concatenates them
	children: [
		{
			tag: "rect",
			attrs: {
				x: margin, y: margin,
				width: rectWidth, height: rectHeight,
				fill: "#0076FF", stroke: "#00D800", "stroke-width": 3,
			}
		},
	] + [ // list comprehensions let us easily generate objects from a template
		{
			tag: "circle",
			attrs: {
				// define object-local variable
				local r = (nCircles - i) * 5,
				// 10 dashes around the even-numbered circles (innermost = 0)
				local strokeDasharray = if (i + nCircles) % 2 == 0 then "none" else diameter(r) / (2 * 10),
				cx: w/2, cy: h/2, r: r,
				fill: circleFill(i),
				stroke: "black", "stroke-width": 1, "stroke-dasharray": strokeDasharray,
			}
		}
		// a stdlib function, produces range from low to high (inclusive of both)
		for i in std.range(0, nCircles-1)
	]
}
`
			: filename.toUpperCase().endsWith(".json")
				? "{}"
				: "";

		try {
			// Create empty file
			const textEncoder = new TextEncoder();
			const emptyContent = textEncoder.encode(initialContents.trim());
			filesData.fs.addFileContents(trimmed, emptyContent, true);

			// Trigger filesystem change to update UI and regenerate SVG
			filesData = { fs: filesData.fs };

			// Open the new file in text editor
			handleOpenTextFile(trimmed);
		} catch (error) {
			console.error("Error creating new file:", error);
			alert(
				`Failed to create file: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	function downloadProject() {
		const jsonB64 = filesData.fs.toJsonB64();
		const blob = new Blob([jsonB64], { type: "text/plain" });
		const url = URL.createObjectURL(blob);

		const a = document.createElement("a");
		a.href = url;
		a.download = "project.clgn";
		a.style.display = "none";

		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);

		URL.revokeObjectURL(url);
	}

	function handleGlobalKeydown(event: KeyboardEvent) {
		// Only trigger if no specific element is focused or if focus is on body
		const activeElement = document.activeElement;
		if (
			(activeElement === document.body || activeElement === null) &&
			(event.key === "o" || event.key === "O") &&
			!uploading
		) {
			event.preventDefault();
			openFilePicker();
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div
	class="file-list"
	class:drag-over={dragOver}
	role="region"
	aria-label="File information"
	aria-describedby="file-list-hint"
	data-testid="filelist-dropzone"
	title="Drop files and folders below to add to your project. Click a text file to edit it."
	ondragenter={handleDragEnter}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	<Toolbar ariaLabel="File information">
		<div class="file-list-header-stats">
			<h3>Files ({filesData.fs.getFileCount()})</h3>
			<div class="file-summary">
				<div class="total-size">
					Total: {formatFileSize(fileStats.totalSize)}
				</div>
				<ControlButton
					action="download-project"
					onclick={downloadProject}
					title="Download project as .clgn file"
					ariaLabel="Download project"
				/>
			</div>
		</div>
	</Toolbar>

	{#if fileStats.warnings.length > 0}
		<div class="file-list-warnings">
			{#each fileStats.warnings as warning}
				<div class="file-warning {warning.type}">
					{#if warning.type === "warning"}⚠️{:else}💡{/if}
					{warning.message}
				</div>
			{/each}
		</div>
	{/if}

	<div class="files-container">
		{#each filesSorted as [path, file] (path)}
			{#snippet fileListItem()}
				<div class="file-path">{path}</div>
				<div class="file-actions">
					<div class="file-size">
						{#if file && typeof file.bytes.length === "number"}
							{formatFileSize(file.bytes.length)}
							{#if file.bytes.length > largeFileSizeWarningThreshold}
								<span class="size-warning" title="Large file">⚠️</span>
							{/if}
						{:else}
							Unknown size
						{/if}
					</div>
					<button
						class="delete-button"
						aria-label="Remove {path}"
						title="Remove file"
						onclick={e => {
							e.stopPropagation();
							deleteFile(path);
						}}
					>
						<ButtonIcon action="trash" />
					</button>
				</div>
			{/snippet}

			{#if isTextPath(path) || isImagePath(path)}
				<div
					class="file-item clickable"
					onclick={() => maybeOpen(path)}
					onkeydown={e => {
						if (
							e.key === "Enter" ||
							e.key === " " ||
							e.code === "Space"
						) {
							e.preventDefault();
							maybeOpen(path);
						}
					}}
					role="button"
					tabindex="0"
					title={isTextPath(path)
						? `Click to edit '${path}'`
						: `Click to view '${path}'`}
					aria-label={isTextPath(path) ? `Edit ${path}` : `View ${path}`}
				>
					{@render fileListItem()}
				</div>
			{:else}
				<div class="file-item" title={path} aria-label={`File ${path}`}>
					{@render fileListItem()}
				</div>
			{/if}
		{/each}
	</div>

	<div class="file-list-bottom-hint" aria-hidden="true">
		Click a text file above to edit it. To add files to your project, drop
		them above or use the buttons below.
	</div>

	<div class="button-group">
		<button
			class="file-list-button new-file-button"
			onclick={createNewFile}
			disabled={uploading}
			title="Create new empty file"
			aria-label="Create new empty file"
		>
			New file
		</button>
		<button
			class="file-list-button browse-button"
			onclick={openFilePicker}
			disabled={uploading}
			title="Browse for files (Keyboard: O)"
			aria-label="Browse for files, keyboard shortcut O key"
		>
			Upload
		</button>
	</div>

	{#if trashedFiles.length > 0}
		<div class="undo-bar">
			<div class="undo-message">
				Removed {trashedFiles.length} file{trashedFiles.length > 1
					? "s"
					: ""}
			</div>
			<button class="undo-button" onclick={undoAllDeletions}>
				Undo ({Math.ceil(countdownValue / 1000)}s)
			</button>
		</div>
	{/if}
</div>

<style>
	.file-list {
		/* Fill available space in sidebar without forcing parent to grow */
		flex: 1;
		min-height: 0;
		height: 100%;
		display: flex;
		flex-direction: column;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.5em;
		overflow: hidden; /* ensure rounded corners clip inner toolbar backgrounds */
	}

	.file-list.drag-over {
		outline: 2px dashed #2563eb;
		background: #eff6ff;
	}

	.file-list-header-stats {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		width: 100%;
	}

	.file-summary {
		font-size: 0.875em;
		display: flex;
		align-items: center;
		gap: 0.5em;
	}

	.total-size {
		font-weight: 600;
		color: #374151;
	}

	.file-list-warnings {
		margin-top: 0.5em;
	}

	.file-warning {
		padding: 0.5em 0.75em;
		border-radius: 0.375em;
		font-size: 0.8em;
		line-height: 1.3;
		margin-bottom: 0.25em;
	}

	.file-warning.warning {
		background: #fef3c7;
		border: 1px solid #f59e0b;
		color: #92400e;
	}

	.file-warning.info {
		background: #dbeafe;
		border: 1px solid #3b82f6;
		color: #1e40af;
	}

	.files-container {
		flex: 1;
		min-height: 0;
		padding: 0.5em;
		overflow-y: auto;
		scroll-behavior: smooth;
	}

	.file-list-bottom-hint {
		flex-shrink: 0;
		text-align: center;
		padding: 0.5em;
		margin: 0 1em 0.5em 1em;
		font-size: 0.8em;
		color: #6b7280;
	}

	.file-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5em 0.5em 0.5em 0.75em;
		margin-bottom: 0.125em;
		background: #ffffff;
		border: 1px solid #f3f4f6;
		border-radius: 0.375em;
		transition: background-color 0.2s;
	}

	.file-item:hover {
		background: #f8f9fa;
		border-color: #e5e7eb;
	}

	.file-item.clickable {
		cursor: pointer;
	}

	.file-path {
		color: #4b5563;
		font-family: monospace;
		font-size: 0.875em;
		flex: 1;
		margin-right: 1em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.file-size {
		color: #6b7280;
		font-size: 0.8em;
		font-weight: 500;
		display: flex;
		align-items: center;
		gap: 0.25em;
		flex-shrink: 0;
	}

	.size-warning {
		color: #f59e0b;
		font-size: 1.1em;
	}

	.file-actions {
		display: flex;
		align-items: center;
		gap: 0.5em;
	}

	.delete-button {
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.25em;
		border-radius: 0.25em;
		font-size: 0.9em;
		opacity: 0;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 1.5em;
		min-height: 1.5em;
	}

	.file-item:hover .delete-button {
		opacity: 0.6;
	}

	.file-item:hover .delete-button:hover {
		opacity: 1;
		background: #fee2e2;
		transform: scale(1.1);
	}

	.delete-button:focus {
		outline: 2px solid #ef4444;
		outline-offset: 1px;
		opacity: 1;
	}

	.undo-bar {
		flex-shrink: 0;
		background: #374151;
		color: white;
		padding: 0.75em;
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-radius: 0 0 0.5em 0.5em;
		box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
		z-index: 10;
	}

	.undo-message {
		font-size: 0.875em;
		font-weight: 500;
	}

	.undo-button {
		background: #ef4444;
		color: white;
		border: none;
		padding: 0.375em 0.75em;
		border-radius: 0.375em;
		font-size: 0.8em;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.undo-button:hover {
		background: #dc2626;
	}

	.undo-button:focus {
		outline: 2px solid white;
		outline-offset: 1px;
	}

	.button-group {
		display: flex;
		gap: 0.7em;
		margin: 0.25em 0.8em 0.8em 0.8em;
	}

	/* Common button base styles */
	.file-list-button {
		padding: 0.75em 1.5em;
		border-radius: 0.375em;
		font-size: 0.875em;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.1s ease-in-out;
		flex-shrink: 0;
		box-sizing: border-box;
		flex: 1;
	}

	.file-list-button:disabled {
		cursor: not-allowed;
	}

	/* New file button - gray theme */
	.new-file-button {
		background: #f9fafb;
		color: #374151;
		border: 1px solid #d1d5db;
	}

	.new-file-button:hover:not(:disabled) {
		background: #f3f4f6;
		border-color: #9ca3af;
	}

	.new-file-button:active:not(:disabled) {
		background: #e5e7eb;
	}

	.new-file-button:disabled {
		background: #f9fafb;
		color: #9ca3af;
	}

	.new-file-button:focus {
		outline: 2px solid #6b7280;
		outline-offset: 2px;
	}

	/* Browse button - blue theme */
	.browse-button {
		background: #2563eb;
		color: white;
		border: none;
	}

	.browse-button:hover:not(:disabled) {
		background: #3978ff;
	}

	.browse-button:active:not(:disabled) {
		background: #4a84ff;
	}

	.browse-button:disabled {
		background: #2563eb;
		color: white;
	}

	.browse-button:focus {
		outline: 2px solid #2563eb;
		outline-offset: 2px;
	}

	@media (max-width: 1024px) {
		.file-list {
			flex: auto;
			max-height: 95vh;
		}
	}
</style>
