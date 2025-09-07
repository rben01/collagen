<script lang="ts">
	import { onMount } from "svelte";

	import {
		collectFromDataTransfer,
		collectFromFileList,
		stripFolderPrefix as helperStripFolderPrefix,
	} from "./upload-helpers";

	onMount(() => {
		window.fileUploaderMounted = true;
	});

	let {
		disabled = false,
		handleFilesUploaded,
		externalError = null,
		compact = false,
	}: {
		disabled: boolean;
		handleFilesUploaded: (
			files: Map<string, File>,
			root: string,
		) => Promise<void>;
		handleClearFiles: () => void;
		externalError?: string | null;
		compact?: boolean;
	} = $props();

	let dragOver = $state(false);
	let errorMessage = $state<string | null>(null);

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

	function handleDragEnter(event: DragEvent) {
		event.preventDefault();
		if (!disabled) {
			dragOver = true;
		}
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
			const { fileMap, root } = await collectFromDataTransfer(items);
			handleProcessingSuccess(fileMap, root);
		} catch (error) {
			handleProcessingError(error);
		}
	}

	async function processFilesFromFileList(fileList: FileList) {
		clearProcessingError();
		try {
			console.log("🔄 Processing files from file picker...");
			const { fileMap, root } = await collectFromFileList(fileList);
			handleProcessingSuccess(fileMap, root);
		} catch (error) {
			handleProcessingError(error);
		}
	}

	// File entry traversal is implemented in upload-helpers

	const stripFolderPrefix = helperStripFolderPrefix;

	function clearProcessingError() {
		errorMessage = null;
	}

	function handleProcessingSuccess(
		fileMap: Map<string, File>,
		rootFolderName: string,
	) {
		const cleanedFileMap = stripFolderPrefix(fileMap, rootFolderName);

		console.log("✨ Cleaned file data size:", cleanedFileMap.size, "files");

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

	function handleBrowseClick(event: Event) {
		event.stopPropagation();
		openFolderPicker();
	}

	function handleBrowseKeyDown(event: KeyboardEvent) {
		if (event.key === "Enter" && !disabled) {
			event.preventDefault();
			event.stopPropagation();
			openFolderPicker();
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if ((event.key === "Enter" || event.key === " ") && !disabled) {
			event.preventDefault();
			openFolderPicker();
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="uploader" class:compact>
	<div
		class="drop-zone"
		class:drag-over={dragOver}
		class:disabled
		class:compact
		ondragenter={handleDragEnter}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
		onclick={openFolderPicker}
		onkeydown={handleKeyDown}
		role="button"
		aria-label="File upload drop zone - drag and drop files, click to browse, or press Enter when focused"
		title="Drop files here or click to browse (Enter when focused, O when nothing is focused)"
		tabindex="0"
	>
		{#if errorMessage || externalError}
			<div class="error-message">
				<span class="error-icon">⚠️</span>
				{errorMessage || externalError}
			</div>
		{/if}

		<div class="upload-content">
			{#if !compact}
				<h3>Upload Collagen Project</h3>
				<p>
					Drag and drop a <code>collagen.json</code> or a
					<code>collagen.jsonnet</code> manifest file, or a folder
					containing one of those and any other resources. Or press O to
					<em>open</em> the file/folder picker.
				</p>
			{:else}
				<h4>Add More Files</h4>
				<p>
					Drop files or click to browse - new files will be added to your
					project
				</p>
			{/if}

			<button
				class="browse-btn"
				onclick={handleBrowseClick}
				onkeydown={handleBrowseKeyDown}
				title="Browse for file or folder (Enter to open when focused, O when nothing is focused)"
				aria-label="Browse for file or folder - press Enter to open file picker"
				{disabled}
			>
				Browse
			</button>
		</div>
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

	.drop-zone.compact {
		padding: 1.5em 1em;
		border-radius: 0.5em;
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

	.upload-content h4 {
		margin: 0.5em 0 0.25em 0;
		color: #374151;
		font-size: 1.1em;
		font-weight: 600;
	}

	.upload-content p {
		color: #6b7280;
		margin: auto;
		margin-bottom: 1.5em;
		line-height: 1.5;
		max-width: min(80%, 640px);
	}

	.compact .upload-content p {
		margin-bottom: 1em;
		font-size: 0.9em;
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
</style>
