<script>
	import { onMount } from "svelte";
	import FileUploader from "./FileUploader.svelte";
	import SvgDisplay from "./SvgDisplay.svelte";

	let wasm;
	let error = null;
	let loading = false;
	let svgOutput = null;
	let filesData = null;

	onMount(async () => {
		try {
			// Import the WASM module
			wasm = await import("../Cargo.toml");
			console.log("WASM module loaded successfully");
		} catch (err) {
			console.error("Failed to load WASM module:", err);
			error = "Failed to load WASM module: " + err.message;
		}
	});

	async function handleFilesUploaded(event) {
		const { files, folderName } = event.detail;
		filesData = files;
		svgOutput = null;
		error = null;

		if (!wasm) {
			error = "WASM module not loaded yet";
			return;
		}

		try {
			loading = true;

			// Convert FileList to Map for WASM
			const fileMap = new Map();
			for (const [path, file] of Object.entries(files)) {
				fileMap.set(path, file);
			}

			// Create in-memory filesystem
			const fsHandle = await wasm.createInMemoryFs(fileMap, folderName);
			console.log(`Created in-memory filesystem with ${fsHandle.getFileCount()} files` + (folderName ? ` from folder "${folderName}"` : ''));

			// Check for manifest
			const manifestType = fsHandle.hasManifest();
			console.log(manifestType);
			if (manifestType === "none") {
				error =
					"No manifest file found. Please include collagen.json or collagen.jsonnet";
				return;
			}

			// Generate SVG
			const svg = wasm.generateSvg(fsHandle, manifestType);
			svgOutput = svg;
			console.log("Generated SVG successfully");
		} catch (err) {
			console.error("Error processing files:", err);
			error = "Error processing files: " + err.message;
		} finally {
			loading = false;
		}
	}

	function handleClearFiles() {
		filesData = null;
		svgOutput = null;
		error = null;
	}
</script>

<main>
	<h1>Collagen Web</h1>
	<p>Generate SVG collages from JSON/Jsonnet manifests</p>

	{#if error}
		<div class="error">
			<strong>Error:</strong>
			{error}
		</div>
	{/if}

	{#if loading}
		<div class="loading">
			<p>Processing files...</p>
		</div>
	{/if}

	<div class="upload-section">
		<FileUploader
			on:files-uploaded={handleFilesUploaded}
			on:clear={handleClearFiles}
			disabled={loading || !wasm}
		/>
	</div>

	{#if filesData}
		<div class="files-info">
			<h3>Uploaded Files ({Object.keys(filesData).length})</h3>
			<ul>
				{#each Object.keys(filesData) as path}
					<li>{path}</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if svgOutput}
		<div class="svg-section">
			<SvgDisplay svg={svgOutput} />
		</div>
	{/if}
</main>

<style>
	main {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2em;
		font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu,
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

	.error {
		background: #fee2e2;
		border: 1px solid #fecaca;
		color: #dc2626;
		padding: 1em;
		border-radius: 0.5em;
		margin-bottom: 1em;
	}

	.loading {
		text-align: center;
		padding: 2em;
		color: #6b7280;
	}

	.upload-section {
		margin-bottom: 2em;
	}

	.files-info {
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.5em;
		padding: 1em;
		margin-bottom: 2em;
	}

	.files-info h3 {
		margin: 0 0 0.5em 0;
		color: #374151;
	}

	.files-info ul {
		list-style-type: none;
		padding: 0;
		margin: 0;
	}

	.files-info li {
		padding: 0.25em 0;
		color: #6b7280;
		font-family: monospace;
		font-size: 0.9em;
	}

	.svg-section {
		border-top: 1px solid #e5e7eb;
		padding-top: 2em;
	}
</style>
