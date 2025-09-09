<script lang="ts">
	import type {
		InMemoryFileSystem,
		FileContent,
	} from "$lib/collagen-ts/index.js";
	import { formatFileSize, MB } from "$lib/collagen-ts/utils";
	import { isTextPath } from "$lib/collagen-ts/index.js";
	import {
		collectFromDataTransfer,
		stripFolderPrefix,
	} from "./upload-helpers";
	import Toolbar from "./Toolbar.svelte";
	import ButtonIcon from "./ButtonIcon.svelte";

	let {
		filesData,
		handleRemoveFile,
		handleFilesystemChange,
		handleFilesUploaded,
		handleOpenTextFile,
	}: {
		filesData: { fs: InMemoryFileSystem };
		handleRemoveFile: (path: string) => Promise<FileContent | undefined>;
		handleFilesystemChange: () => Promise<void>;
		handleFilesUploaded: (
			files: Map<string, File>,
			root: string,
		) => Promise<void>;
		handleOpenTextFile: (path: string) => void;
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

	$effect(() => {
		if (countdownValue <= 0) {
			trashedFiles = [];
			if (countdownInterval) clearInterval(countdownInterval);
			countdownInterval = null;
		}
	});

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
		const { fileMap, root } = await collectFromDataTransfer(
			event.dataTransfer.items,
		);
		const cleaned = stripFolderPrefix(fileMap, root);
		await handleFilesUploaded(cleaned, root);
	}

	// Handle file deletion
	async function deleteFile(path: string) {
		const removedFile = await handleRemoveFile(path);
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

		// Trigger SVG regeneration in parent component
		await handleFilesystemChange();
	}

	function maybeOpen(path: string) {
		if (isTextPath(path)) {
			handleOpenTextFile(path);
		}
	}
</script>

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
				<div class="file-path" title={path}>{path}</div>
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

			{#if isTextPath(path)}
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
					aria-label={`Edit ${path}`}
				>
					{@render fileListItem()}
				</div>
			{:else}
				<div class="file-item" aria-label={`File ${path}`}>
					{@render fileListItem()}
				</div>
			{/if}
		{/each}
	</div>

	<div class="file-list-bottom-hint" aria-hidden="true">
		Drop items above to add them to your project
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
	}

	.file-list-bottom-hint {
		flex-shrink: 0;
		text-align: center;
		padding: 0.5em;
		margin-bottom: 0.5em;
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

	/* Scrollbar styling */
	.files-container::-webkit-scrollbar {
		width: 6px;
	}

	.files-container::-webkit-scrollbar-track {
		background: #f1f5f9;
		border-radius: 3px;
	}

	.files-container::-webkit-scrollbar-thumb {
		background: #cbd5e1;
		border-radius: 3px;
	}

	.files-container::-webkit-scrollbar-thumb:hover {
		background: #94a3b8;
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
</style>
