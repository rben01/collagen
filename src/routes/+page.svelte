<script lang="ts">
	import FileUploader from "./FileUploader.svelte";
	import FileList from "./FileList.svelte";
	import SvgDisplay from "./SvgDisplay.svelte";
	import TextEditor from "./TextEditor.svelte";
	import {
		toCollagenError,
		InMemoryFileSystem,
	} from "../lib/collagen-ts/index.js";
	import { tick } from "svelte";

	let error: string | null = $state(null);
	let loading = $state(false);
	let showLoading = $state(false);
	let loadingTimer: ReturnType<typeof setTimeout> | null = $state(null);
	let svgOutput: string | null = $state(null);
	let editorPath: string | null = $state(null);
	let editorText: string | null = $state(null);
	// Debounced editor persistence state
	let persistTimer: ReturnType<typeof setTimeout> | null = $state(null);
	let lastPersistAt = $state(0);
	const PERSIST_MS = 200; // ~5 writes/sec, persist within 0.2s

	const LOADING_DELAY_MS = 500;
	const textEncoder = new TextEncoder();
	const textDecoder = new TextDecoder();

	function startLoading({ clearSvg, clearError = true }: { clearSvg: boolean; clearError?: boolean }) {
		// Reset error and optionally clear SVG (for first loads)
		if (clearError) error = null;
		if (clearSvg) svgOutput = null;
		loading = true;
		// Defer showing the loading UI to avoid flicker on fast ops
		if (loadingTimer) clearTimeout(loadingTimer);
		showLoading = false;
		loadingTimer = setTimeout(() => (showLoading = true), LOADING_DELAY_MS);
	}

	function stopLoading() {
		loading = false;
		if (loadingTimer) clearTimeout(loadingTimer);
		loadingTimer = null;
		showLoading = false;
	}

	function setErrorState(err: unknown) {
		const compatError = toCollagenError(err);
		error = compatError.message;
		svgOutput = null;
	}
	// packing it in an object is a trick to get svelte to re-render downstream
	let filesData: { fs: InMemoryFileSystem } | null = $state(null);
	let svgDisplayComponent: SvgDisplay | null = $state(null);

	function handleOpenTextFile(path: string) {
		editorPath = path;
		if (!filesData) return;
		const file = filesData.fs.load(path);
		editorText = textDecoder.decode(file.bytes);
	}

	function handleCloseEditor() {
		if (persistTimer) {
			clearTimeout(persistTimer);
			persistTimer = null;
		}
		persistEditorChanges().finally(() => {
			editorPath = null;
			editorText = null;
		});
	}

	function onUpdateText(newText: string) {
		editorText = newText;
		schedulePersist();
	}

	function schedulePersist() {
		const now = Date.now();
		const elapsed = now - lastPersistAt;
		if (elapsed >= PERSIST_MS) {
			// Leading edge: persist immediately
			void persistEditorChanges();
			return;
		}
		if (!persistTimer) {
			const delay = Math.max(0, PERSIST_MS - elapsed);
			persistTimer = setTimeout(async () => {
				persistTimer = null;
				await persistEditorChanges();
			}, delay);
		}
	}

	async function persistEditorChanges() {
		if (!filesData || !editorPath || editorText === null) return;
		try {
			const bytes = textEncoder.encode(editorText);
			filesData.fs.addFileContents(editorPath, { bytes, path: editorPath });
			lastPersistAt = Date.now();
			await handleFilesystemChange();
		} catch (err) {
			console.error("Failed to persist editor changes:", err);
		}
	}

	// TODO: I'm pretty sure most of these "handle" functions can be replaced by Svelte's
	// own reactivity
	async function handleFilesUploadedWithRoot(
		files: Map<string, File>,
		root: string,
	) {
		console.log("🔄 Starting file processing...");

		console.log("📁 Files received:", files.size, "files");
		if (root) {
			console.log("📂 Root folder:", root);
		}

		// If we already have a filesystem, merge the new files into it
		if (filesData) {
			console.log("📂 Merging files into existing filesystem...");
			await filesData.fs.mergeFiles(files);
			await handleFiles(filesData.fs);
		} else {
			// First upload - create new filesystem
			await handleFiles(await InMemoryFileSystem.create(files));
		}
	}

	async function handleFiles(fs: InMemoryFileSystem) {
		console.log("🔄 Processing files...");

		try {
			filesData = { fs };
			startLoading({ clearSvg: true, clearError: true });

			// Normalize paths to ensure leading slash for TypeScript implementation
			console.log("🗺️ Normalizing file paths...");
			// Check for manifest and handle jsonnet compilation if needed
			console.log("🔍 Processing manifest...");

			// Generate SVG using the processed manifest data
			console.log("🎨 Generating SVG...");
			svgOutput = await fs.generateSvg();
			if (svgOutput) {
				console.log(
					"✅ SVG generated successfully! Length:",
					svgOutput.length,
				);
			}
		} catch (err) {
			console.error("Error processing files:", err);
			setErrorState(err);
		} finally {
			stopLoading();
		}
	}

	// Auto-focus SVG viewer when SVG is generated
	$effect(() => {
		if (svgOutput && svgDisplayComponent && !editorPath) {
			tick().then(() => svgDisplayComponent!.focus());
		}
	});

	function handleClearFiles() {
		filesData = null;
		svgOutput = null;
		error = null;
	}

	async function handleRemoveFile(path: string) {
		if (!filesData) return;

		// Remove the file from the filesystem
		const removedFile = filesData.fs.removeFile(path);
		if (removedFile) {
			handleFilesystemChange();
		}

		return removedFile;
	}

	async function handleFilesystemChange() {
		if (!filesData) return;

		filesData = { fs: filesData.fs };

		// Attempt to regenerate SVG
		try {
			// Avoid flicker: keep current SVG and existing error while we regenerate
			startLoading({ clearSvg: false, clearError: false });

			svgOutput = await filesData.fs.generateSvg();
			if (svgOutput) {
				console.log("✅ SVG regenerated after filesystem change");
			}
		} catch (err) {
			console.error("Error regenerating SVG after filesystem change:", err);
			setErrorState(err);
		} finally {
			stopLoading();
		}
	}
</script>

<svelte:head>
	<title>Collagen: The Collage Generator</title>
	<meta name="description" content="An easier way to generate SVG" />
</svelte:head>

<main>
	{#if !filesData && !svgOutput}
		<!-- Show title section only when no files are uploaded -->
		<h1>Collagen Web</h1>
		<p>Generate SVG collages from JSON/Jsonnet manifests</p>
	{/if}

	{#if !filesData && !svgOutput}
		<!-- Initial state: show full-width uploader -->
		<div class="upload-section">
			<FileUploader
				handleFilesUploaded={handleFilesUploadedWithRoot}
				{handleClearFiles}
				disabled={loading}
			/>
		</div>
	{:else}
		<!-- Files uploaded state: show side-by-side layout -->
		<div class="app-layout">
			{#snippet svgViewerContent(controlsVisible: boolean)}
				{#if svgOutput}
					<SvgDisplay
						svg={svgOutput}
						bind:this={svgDisplayComponent}
						controlsVisible={controlsVisible}
					/>
				{:else if error}
					<div class="error-state">
						<div class="error-content error-message">
							<span class="error-icon">⚠️</span>
							<p class="error-description">{error}</p>
						</div>
					</div>
				{:else if showLoading}
					<div class="loading-state">
						<p>Processing files...</p>
					</div>
				{:else}
					<div class="waiting-state">
						<p>Waiting for SVG generation...</p>
					</div>
				{/if}
			{/snippet}
			<!-- Left sidebar: file list (and compact SVG when editing) -->
			<div class="sidebar" class:editing={!!editorPath}>
				{#if filesData}
					{#if editorPath}
						<div class="sidebar-top">
							<FileList
								{filesData}
								{handleRemoveFile}
								{handleFilesystemChange}
								handleFilesUploaded={handleFilesUploadedWithRoot}
								{handleOpenTextFile}
							/>
						</div>
						<div
							class="sidebar-bottom compact-svg"
							role="region"
							aria-label="Generated SVG display (compact)"
						>
							{@render svgViewerContent(false)}
						</div>
					{:else}
						<FileList
							{filesData}
							{handleRemoveFile}
							{handleFilesystemChange}
							handleFilesUploaded={handleFilesUploadedWithRoot}
							{handleOpenTextFile}
						/>
					{/if}
				{/if}
			</div>

			<!-- Right main content area: SVG viewer (default) or text editor (when editing) -->
			<div class="main-content">
				{#if editorPath}
					<TextEditor
						path={editorPath}
						bind:text={editorText}
						{onUpdateText}
						{handleCloseEditor}
					/>
				{:else}
					<div
						class="svg-section"
						role="region"
						aria-label="Generated SVG display"
					>
						{@render svgViewerContent(true)}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</main>

<style>
	main {
		--v-margin: 2em;

		max-width: calc(min(1200px, 90vw));
		margin: var(--v-margin) auto;
		font-family:
			-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu,
			Cantarell, sans-serif;
	}

	h1 {
		color: #2563eb;
		text-align: center;
		font-size: 2.5em;
		margin-bottom: 0.5em;
	}

	p {
		text-align: center;
		color: #6b7280;
		font-size: 1.1em;
		margin-bottom: 2em;
	}

	.upload-section {
		margin-bottom: 2em;
	}

	.app-layout {
		display: flex;
		gap: 2em;
		margin: auto 0;
		height: calc(100vh - 2 * var(--v-margin));
		box-sizing: border-box;
	}

	.sidebar {
		/* Fix sidebar width to 25vw so it doesn't change as content changes */
		flex: 0 0 25vw;
		width: 25vw;
		min-width: 25vw;
		max-width: 25vw;
		display: flex;
		flex-direction: column;
		min-height: 0;
		max-height: 100%;
		height: 100%;
		box-sizing: border-box;
	}

	.sidebar.editing {
		flex: 0 0 35vw;
		width: 35vw;
		min-width: 35vw;
		max-width: 35vw;
	}

	.sidebar-top,
	.sidebar-bottom {
		flex: 1 1 50%;
		min-height: 0;
		max-height: 50%;
		display: flex;
		flex-direction: column;
	}

	.sidebar-bottom.compact-svg {
		margin-top: 0.75em;
		border: 1px solid #e5e7eb;
		border-radius: 0.5em;
		background: #fff;
	}

	.main-content {
		flex: 4 0 580px;
		min-height: 0;
		display: flex;
		justify-items: stretch;
	}

	.svg-section {
		flex: 1;
		min-height: 0;
		max-width: 100%;
	}

	.loading-state,
	.waiting-state,
	.error-state {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.5em;
		color: #6b7280;
		font-size: 1.1em;
	}

	.error-state {
		background: #fef2f2;
		border-color: #fecaca;
		color: #dc2626;
	}

	.error-content {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75em;
		text-align: center;
		max-width: 600px;
		padding: 1em;
	}

	.error-content .error-icon {
		font-size: 1.5em;
		flex-shrink: 0;
	}

	.error-content p {
		margin: 0;
		line-height: 1.4;
		font-size: 1em;
	}

	/* Responsive design */
	@media (max-width: 1024px) {
		.app-layout {
			flex-direction: column;
			height: auto;
			min-height: 0;
		}

		.sidebar {
			/* In stacked layout, allow sidebar to take full width */
			flex: none;
			width: auto;
			min-width: 0;
			max-width: none;
			order: 2;
		}

		.main-content {
			flex: none;
			order: 1;
			min-height: 400px;
		}

		.svg-section {
			height: 400px;
		}
	}

	@media (max-width: 768px) {
		main {
			margin: 1em auto;
		}

		.app-layout {
			gap: 1em;
			height: auto;
		}

		.sidebar {
			flex: none;
		}
	}
</style>
