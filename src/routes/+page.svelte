<script lang="ts">
	import FileList from "./FileList.svelte";
	import SvgDisplay from "./SvgDisplay.svelte";
	import TextEditor from "./TextEditor.svelte";
	import RightPane from "./RightPane.svelte";
	import IntroPane from "./IntroPane.svelte";
	import LoadingPane from "./LoadingPane.svelte";
	import ErrorPane from "./ErrorPane.svelte";
	import {
		toCollagenError,
		InMemoryFileSystem,
	} from "../lib/collagen-ts/index.js";
	import { tick, untrack } from "svelte";

	let error: string | null = $state(null);
	let showLoading = $state(false);
	let loadingTimer: ReturnType<typeof setTimeout> | null = $state(null);
	let svgOutput: string | null = $state(null);
	let editorPath: string | null = $state(null);
	let editorText: string | null = $state(null);
	// Debounced editor persistence state
	let persistTimer: ReturnType<typeof setTimeout> | null = $state(null);
	let lastPersistAt = $state(0);
	const PERSIST_MS = 200; // ~5 writes/sec, persist within 0.2s

	const textEncoder = new TextEncoder();
	const textDecoder = new TextDecoder();

	function stopLoading() {
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
	let filesData: { fs: InMemoryFileSystem } = $state({
		fs: InMemoryFileSystem.createEmpty(),
	});

	let svgDisplayComponent: SvgDisplay | null = $state(null);

	// Persistent SVG viewer state that survives component mount/unmount
	let svgScale = $state(1);
	let svgPanX = $state(0);
	let svgPanY = $state(0);
	let svgShowRawSvg = $state(false);
	let svgShowInstructions = $state(false);

	// persist the edited text after a timer
	$effect(() => {
		editorText;
		const now = Date.now();
		const elapsed = now - untrack(() => lastPersistAt);
		if (elapsed >= PERSIST_MS) {
			// Leading edge: persist immediately
			void persistEditorChanges();
			return;
		}
		if (untrack(() => !persistTimer)) {
			const delay = Math.max(0, PERSIST_MS - elapsed);
			persistTimer = setTimeout(() => {
				persistTimer = null;
				persistEditorChanges();
			}, delay);
		}
	});

	function handleOpenTextFile(path: string) {
		editorPath = path;
		// Auto-close help when opening text editor
		svgShowInstructions = false;
		if (!filesData) return;
		const file = filesData.fs.load(path);
		editorText = textDecoder.decode(file.bytes);
	}

	function handleCloseEditor() {
		if (persistTimer) {
			clearTimeout(persistTimer);
			persistTimer = null;
		}
		persistEditorChanges();
		editorPath = null;
		editorText = null;
	}

	function persistEditorChanges() {
		if (!filesData || !editorPath || editorText === null) return;
		try {
			const bytes = textEncoder.encode(editorText);
			filesData.fs.addFileContents(editorPath, bytes, true);
			filesData = { fs: filesData.fs };
			lastPersistAt = Date.now();
		} catch (err) {
			console.error("Failed to persist editor changes:", err);
		}
	}

	// Auto-focus SVG viewer when SVG is generated
	$effect(() => {
		if (svgOutput && svgDisplayComponent && !editorPath) {
			tick().then(() => svgDisplayComponent!.focus());
		}
	});

	$effect(() => {
		const { fs } = filesData;

		// Attempt to regenerate SVG

		// If there are no files, show instructions (no error)
		if (fs.getFileCount() === 0) {
			error = null;
			svgOutput = null;
			stopLoading();
			return;
		}

		fs.generateSvg()
			.then(svg => {
				svgOutput = svg;
				if (untrack(() => svgOutput)) {
					console.log("✅ SVG regenerated after filesystem change");
				}
			})
			.catch(err => {
				console.error(
					"Error regenerating SVG after filesystem change:",
					err,
				);
				setErrorState(untrack(() => err));
			})
			.finally(stopLoading);
	});
</script>

<svelte:head>
	<title>Collagen: The Collage Generator</title>
	<meta name="description" content="An easier way to generate SVG" />
</svelte:head>

<main>
	<div
		class="app-layout"
		class:started={filesData && filesData.fs.getFileCount() > 0}
	>
		{#snippet svgViewerContent(controlsVisible: boolean)}
			{#if svgOutput}
				<SvgDisplay
					svg={svgOutput}
					bind:this={svgDisplayComponent}
					{controlsVisible}
					{editorPath}
					bind:scale={svgScale}
					bind:panX={svgPanX}
					bind:panY={svgPanY}
					bind:showRawSvg={svgShowRawSvg}
					bind:showInstructions={svgShowInstructions}
				/>
			{:else if error}
				{#if controlsVisible}
					<ErrorPane message={error} />
				{:else}
					<div class="error-state">
						<div class="error-content error-message">
							<span class="error-icon">⚠️</span>
							<p class="error-description">{error}</p>
						</div>
					</div>
				{/if}
			{:else if showLoading}
				{#if controlsVisible}
					<LoadingPane />
				{:else}
					<div class="loading-state">
						<p>Processing files...</p>
					</div>
				{/if}
			{:else if controlsVisible}
				<IntroPane />
			{:else}
				<div class="waiting-state">
					<div class="welcome">
						<h2>Welcome to Collagen Web</h2>
						<p>
							Drop a <code>collagen.json</code> or
							<code>collagen.jsonnet</code>
							(or a whole folder) onto the File List on the left to get started.
						</p>
					</div>
				</div>
			{/if}
		{/snippet}
		<!-- Left sidebar: file list (and compact SVG when editing) -->
		<div class="sidebar" class:editing={!!editorPath}>
			{#if filesData}
				{#if editorPath}
					<div class="sidebar-top">
						<FileList bind:filesData {handleOpenTextFile} />
					</div>
					<div
						class="sidebar-bottom compact-svg"
						role="region"
						aria-label="Generated SVG display (compact)"
					>
						{@render svgViewerContent(false)}
					</div>
				{:else}
					<FileList bind:filesData {handleOpenTextFile} />
				{/if}
			{:else}
				<div class="file-list" aria-label="File information"></div>
			{/if}
		</div>

		<!-- Right main content area: SVG viewer (default) or text editor (when editing) -->
		<div class="main-content">
			{#if editorPath}
				{#snippet editorContent()}
					<TextEditor
						path={editorPath!}
						bind:text={editorText}
						{handleCloseEditor}
					/>
				{/snippet}
				<RightPane ariaLabelContent="Text editor" content={editorContent} />
			{:else}
				{#snippet rightViewer()}
					{@render svgViewerContent(true)}
				{/snippet}
				<RightPane
					ariaLabelContent="Generated SVG display"
					content={rightViewer}
				/>
			{/if}
		</div>
	</div>
</main>

<style>
	main {
		--v-margin: 2rem;
		margin: var(--v-margin) 2vw;
		font-family:
			-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu,
			Cantarell, sans-serif;
	}

	/* No separate upload section; workspace is always visible */

	.app-layout {
		display: flex;
		gap: 1.25rem;
		margin: var(--v-margin) 0;
		height: calc(100vh - 2 * var(--v-margin));
		box-sizing: border-box;
	}

	.sidebar {
		flex: 0 0 25vw;
		width: 25vw;
		min-width: 25vw;
		max-width: 25vw;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		min-height: 0;
		max-height: 100%;
		height: 100%;
		box-sizing: border-box;
	}

	.sidebar.editing {
		flex: 0 0 35vw;
	}

	.sidebar-top,
	.sidebar-bottom {
		min-height: 0;
		max-height: 50%;
		display: flex;
		flex-direction: column;
	}

	.sidebar-bottom.compact-svg {
		border: 1px solid #e5e7eb;
		border-radius: 0.5em;
		background: #fff;
		overflow: hidden; /* ensure child content respects rounded corners */
	}

	.main-content {
		flex: 4 0 580px;
		/* flex items have `min-[width,height]: auto` unless you manually set to 0 */
		min-width: 0;
		min-height: 0;
		display: flex;
		justify-items: stretch;
	}

	/* right pane styling handled by RightPane */

	.loading-state,
	.waiting-state,
	.error-state {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #ffffff; /* sits inside pane-body */
		color: #374151; /* higher contrast text */
		font-size: 1.1em;
	}

	.error-state {
		background: #fef2f2;
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

	/* Intro (welcome) styling */
	.waiting-state .welcome {
		text-align: center;
		padding: 2em 2.5em; /* increased padding */
		max-width: 640px;
	}

	.waiting-state .welcome h2 {
		margin: 0 0 0.5em 0;
		color: #2563eb; /* blue title */
		font-weight: 700;
	}

	.waiting-state .welcome p {
		color: #4b5563;
		margin: 0.5em 0 0 0;
	}

	.waiting-state .welcome code {
		background: #f3f4f6;
		color: #111827;
		padding: 0.1em 0.3em;
		border-radius: 0.25em;
	}

	@media (min-width: 1024.5px) {
		.sidebar-top,
		.sidebar-bottom {
			flex: 1;
		}
		.sidebar.editing {
			width: 35vw;
			min-width: 35vw;
			max-width: 35vw;

			:is(.sidebar-bottom, .sidebar-bottom) {
				flex: 1 1 50%;
			}
		}
	}

	@media (max-width: 1024px) {
		main {
			--v-margin: 0.75rem;
		}
		.app-layout {
			flex-direction: column;
			height: auto;
			min-height: calc(100vh - 2 * var(--v-margin));
			gap: 0.75rem;
		}

		.sidebar {
			/* In stacked layout, allow sidebar to take full width */
			flex: 1;
			width: auto;
			min-width: 0;
			max-width: none;
			order: 2;
		}

		.sidebar.editing {
			flex: 1;
		}

		/* Swap order of sidebar elements when editing on mobile */
		.sidebar.editing .sidebar-top {
			order: 2; /* File list goes to bottom */
		}

		.sidebar.editing .sidebar-bottom {
			order: 1; /* SVG viewer goes to top */
			height: 40vw;
		}

		.main-content {
			flex: none;
			order: 1;
			min-height: 400px;
		}
	}
</style>
