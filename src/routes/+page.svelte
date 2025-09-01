<script lang="ts">
	import FileUploader from "./FileUploader.svelte";
	import FileList from "./FileList.svelte";
	import SvgDisplay from "./SvgDisplay.svelte";
	import {
		toCollagenError,
		InMemoryFileSystem,
	} from "../lib/collagen-ts/index.js";
	import { tick } from "svelte";

	let error: string | null = $state(null);
	let loading = $state(false);
	let svgOutput: string | null = $state(null);
	let filesData: InMemoryFileSystem | null = $state(null);
	let svgDisplayComponent: SvgDisplay | null = $state(null);

	async function handleFilesUploadedWithRoot(
		files: Map<string, File>,
		root: string,
	) {
		console.log("🔄 Starting file processing...");

		console.log("📁 Files received:", files.size, "files");
		if (root) {
			console.log("📂 Root folder:", root);
		}

		await handleFiles(await InMemoryFileSystem.create(files));
	}

	async function handleFiles(fs: InMemoryFileSystem) {
		console.log("🔄 Processing files...");

		try {
			loading = true;
			filesData = fs;
			svgOutput = null;
			error = null;

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
			const compatError = toCollagenError(err);
			error = compatError.message;
		} finally {
			loading = false;
		}
	}

	// Auto-focus SVG viewer when SVG is generated
	$effect(() => {
		if (svgOutput && svgDisplayComponent) {
			tick().then(() => svgDisplayComponent!.focus());
		}
	});

	function handleClearFiles() {
		filesData = null;
		svgOutput = null;
		error = null;
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

	{#if loading}
		<div
			class="loading"
			role="status"
			aria-label="Processing files, please wait"
		>
			<p>Processing files...</p>
		</div>
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
			<!-- Left sidebar with files -->
			<div class="sidebar">
				<div class="upload-section-compact">
					<FileUploader
						handleFilesUploaded={handleFilesUploadedWithRoot}
						{handleClearFiles}
						disabled={loading}
						compact={true}
					/>
				</div>

				{#if filesData}
					<FileList {filesData} />
				{/if}
			</div>

			<!-- Right main content area with SVG -->
			<div class="main-content">
				{#if svgOutput}
					<div
						class="svg-section"
						role="region"
						aria-label="Generated SVG display"
					>
						<SvgDisplay svg={svgOutput} bind:this={svgDisplayComponent} />
					</div>
				{:else if loading}
					<div class="loading-state">
						<p>Processing files...</p>
					</div>
				{:else if error}
					<div class="error-state">
						<div class="error-content">
							<span class="error-icon">⚠️</span>
							<p>{error}</p>
						</div>
					</div>
				{:else}
					<div class="waiting-state">
						<p>Waiting for SVG generation...</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</main>

<style>
	main {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2em;
		font-family:
			-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu,
			Cantarell, sans-serif;
	}

	/* Add bottom padding only when showing initial state */
	main:has(.upload-section) {
		padding-bottom: 8em;
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

	.loading {
		text-align: center;
		padding: 2em;
		color: #6b7280;
	}

	.upload-section {
		margin-bottom: 2em;
	}

	.upload-section-compact {
		margin-bottom: 1em;
	}

	/* App layout for side-by-side view */
	.app-layout {
		display: flex;
		gap: 2em;
		margin: auto 0;
		position: absolute;
		left: 4em;
		right: 4em;
		top: 4em;
		bottom: 4em;
		box-sizing: border-box;
	}

	.sidebar {
		flex: 0 0 350px;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.main-content {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.svg-section {
		flex: 1;
		min-height: 0;
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
			flex: none;
			order: 2;
		}

		.main-content {
			flex: none;
			order: 1;
			min-height: 400px;
		}

		.svg-section {
			flex: none;
			height: 400px;
		}
	}

	@media (max-width: 768px) {
		main {
			padding: 1em;
		}

		.app-layout {
			gap: 1em;
		}

		.sidebar {
			flex: none;
		}
	}
</style>
